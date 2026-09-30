import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MarkdownEditor from "@/components/MarkdownEditor";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ImagePlus, Pencil, Trash2, Plus, ArrowRight, ScanLine, Sparkles } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";

const INSIGHTS_HERO_IMAGE = "/insights-hero.jpg";

interface Insight {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  background_image_url: string | null;
  author_name: string | null;
  author_twitter_url: string | null;
  author_linkedin_url: string | null;
  author_facebook_url: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const emptyForm = {
  id: null as string | null,
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  author_name: "",
  author_twitter_url: "",
  author_linkedin_url: "",
  author_facebook_url: "",
  published: false,
  imageFile: null as File | null,
  existingImageUrl: null as string | null,
};

const InsightsPage = () => {
  useSeo({
    title: "Insights — UK Product Labelling & Compliance Guides | Labelring",
    description:
      "Guides and updates on UK product labelling compliance, food and cosmetic regulations, and the EU Digital Product Passport.",
    path: "/insights",
    image: `${window.location.origin}${INSIGHTS_HERO_IMAGE}`,
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [posts, setPosts] = useState<Insight[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!form.imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(form.imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.imageFile]);

  const isAuthor = !!session;
  const authorDisplayName =
    (session?.user.user_metadata?.display_name as string | undefined) ||
    session?.user.email?.split("@")[0] ||
    "";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchPosts = async () => {
    setLoadingPosts(true);
    const { data, error } = await supabase
      .from("insights" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setPosts((data as unknown as Insight[]) ?? []);
    setLoadingPosts(false);
  };

  useEffect(() => {
    fetchPosts();
  }, [session]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    try {
      if (authMode === "signup") {
        if (!name.trim()) {
          toast.error("Please enter your name");
          setAuthSubmitting(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/insights`,
            data: { display_name: name.trim() },
          },
        });
        if (error) throw error;
        toast.success("Account created — you're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      setShowSignIn(false);
      setName("");
      setEmail("");
      setPassword("");
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const openNewPost = () => {
    setForm({ ...emptyForm, author_name: authorDisplayName });
    setFormOpen(true);
  };

  const openEditPost = (post: Insight) => {
    setForm({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? "",
      body: post.body,
      author_name: post.author_name ?? "",
      author_twitter_url: post.author_twitter_url ?? "",
      author_linkedin_url: post.author_linkedin_url ?? "",
      author_facebook_url: post.author_facebook_url ?? "",
      published: post.published,
      imageFile: null,
      existingImageUrl: post.background_image_url,
    });
    setFormOpen(true);
  };

  const handleInlineImageUpload = async (file: File): Promise<string> => {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `inline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("insight-images").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("insight-images").getPublicUrl(path);
      return data.publicUrl;
    } catch (err: any) {
      toast.error(err.message ?? "Image upload failed");
      throw err;
    }
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    const slug = form.slug.trim() ? slugify(form.slug) : slugify(form.title);
    if (!slug) {
      toast.error("Could not derive a URL slug from the title");
      return;
    }

    setSaving(true);
    try {
      let backgroundImageUrl = form.existingImageUrl;

      if (form.imageFile) {
        const ext = form.imageFile.name.split(".").pop() || "jpg";
        const path = `${slug}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("insight-images")
          .upload(path, form.imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage
          .from("insight-images")
          .getPublicUrl(path);
        backgroundImageUrl = publicUrlData.publicUrl;
      }

      const payload = {
        title: form.title.trim(),
        slug,
        excerpt: form.excerpt.trim() || null,
        body: form.body,
        author_name: form.author_name.trim() || null,
        author_twitter_url: form.author_twitter_url.trim() || null,
        author_linkedin_url: form.author_linkedin_url.trim() || null,
        author_facebook_url: form.author_facebook_url.trim() || null,
        background_image_url: backgroundImageUrl,
        published: form.published,
        updated_at: new Date().toISOString(),
      };

      if (form.id) {
        const { error } = await supabase.from("insights" as any).update(payload).eq("id", form.id);
        if (error) throw error;
        toast.success("Post updated");
      } else {
        const { error } = await supabase.from("insights" as any).insert([payload as never]);
        if (error) throw error;
        toast.success("Post created");
      }

      setFormOpen(false);
      fetchPosts();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: Insight) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("insights" as any).delete().eq("id", post.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (post.background_image_url) {
      const path = post.background_image_url.split("/insight-images/")[1];
      if (path) await supabase.storage.from("insight-images").remove([path]);
    }
    toast.success("Post deleted");
    fetchPosts();
  };

  const publicPosts = posts.filter((p) => p.published);
  const visiblePosts = isAuthor ? posts : publicPosts;

  return (
    <div className="space-y-10 pb-4">
      {/* Full-bleed hero banner */}
      <div className="relative -mx-4 md:-mx-8 lg:mx-[calc(50%-50vw)] -mt-6 md:-mt-24">
        <div
          className="relative min-h-[300px] md:min-h-[380px] bg-cover bg-center bg-muted flex items-center"
          style={{ backgroundImage: `url(${INSIGHTS_HERO_IMAGE})` }}
        >
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative w-full max-w-[1400px] mx-auto px-4 md:px-8 py-16 md:py-20">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] text-white text-balance shrink-0">
                Beyond the label
              </h1>
              <p className="text-base md:text-lg text-white/80 max-w-md md:pb-2">
                Expert insights and resources for teams looking to improve packaging, build brand
                recognition and create product experiences that connect with customers.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/30 p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Ready to check your own label?</h2>
          <p className="text-sm text-muted-foreground">
            Scan an existing label or build a new one checked against current UK regulations — both take a couple of minutes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <Link to="/scan">
            <Button size="sm" className="gap-2">
              <ScanLine className="h-3.5 w-3.5" /> Check my label
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link to="/generate">
            <Button variant="outline" size="sm" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" /> Create a digital label
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex justify-end">
        {isAuthor ? (
          <div className="flex items-center gap-2">
            <Button onClick={openNewPost} className="gap-2">
              <Plus className="h-4 w-4" /> New post
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          !authLoading && (
            <Button variant="outline" size="sm" onClick={() => setShowSignIn((v) => !v)}>
              Author
            </Button>
          )
        )}
      </div>

      {!isAuthor && showSignIn && (
        <Card className="max-w-sm p-5 space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Author sign in</h2>
            <p className="text-xs text-muted-foreground">
              {authMode === "signin" ? "Sign in to manage posts." : "Create your author account."}
            </p>
          </div>
          <form onSubmit={handleAuth} className="space-y-3">
            {authMode === "signup" && (
              <div className="space-y-1">
                <Label htmlFor="insights-name" className="text-xs">
                  Your name
                </Label>
                <Input
                  id="insights-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="insights-email" className="text-xs">
                Email
              </Label>
              <Input
                id="insights-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="insights-password" className="text-xs">
                Password
              </Label>
              <Input
                id="insights-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={authSubmitting}>
              {authSubmitting ? "Working…" : authMode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
          >
            {authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </Card>
      )}

      {loadingPosts ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : visiblePosts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePosts.map((post) => (
            <Card key={post.id} className="overflow-hidden group flex flex-col">
              <Link to={`/insights/${post.slug}`} className="block">
                <div
                  className="h-40 bg-muted bg-cover bg-center"
                  style={
                    post.background_image_url
                      ? { backgroundImage: `url(${post.background_image_url})` }
                      : undefined
                  }
                />
              </Link>
              <div className="p-5 space-y-2 flex-1 flex flex-col">
                <div className="flex items-center gap-2 flex-wrap">
                  {!post.published && <Badge variant="secondary">Draft</Badge>}
                </div>
                <Link to={`/insights/${post.slug}`}>
                  <h3 className="font-semibold leading-snug group-hover:underline">{post.title}</h3>
                </Link>
                {post.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{post.excerpt}</p>
                )}
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                  {isAuthor && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditPost(post)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(post)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit post" : "New post"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-slug">URL slug</Label>
              <Input
                id="post-slug"
                placeholder={form.title ? slugify(form.title) : "auto-generated-from-title"}
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-excerpt">Excerpt</Label>
              <Textarea
                id="post-excerpt"
                rows={2}
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-body">Body</Label>
              <MarkdownEditor
                id="post-body"
                rows={14}
                value={form.body}
                onChange={(body) => setForm((f) => ({ ...f, body }))}
                placeholder="Write the post…"
                onImageUpload={handleInlineImageUpload}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-author">Author</Label>
              <Input
                id="post-author"
                value={form.author_name}
                onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="post-author-twitter">Author X / Twitter URL</Label>
                <Input
                  id="post-author-twitter"
                  type="url"
                  placeholder="https://x.com/…"
                  value={form.author_twitter_url}
                  onChange={(e) => setForm((f) => ({ ...f, author_twitter_url: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-author-linkedin">Author LinkedIn URL</Label>
                <Input
                  id="post-author-linkedin"
                  type="url"
                  placeholder="https://linkedin.com/in/…"
                  value={form.author_linkedin_url}
                  onChange={(e) => setForm((f) => ({ ...f, author_linkedin_url: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-author-facebook">Author Facebook URL</Label>
                <Input
                  id="post-author-facebook"
                  type="url"
                  placeholder="https://facebook.com/…"
                  value={form.author_facebook_url}
                  onChange={(e) => setForm((f) => ({ ...f, author_facebook_url: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-image" className="flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" /> Background image
              </Label>
              <Input
                id="post-image"
                type="file"
                accept="image/*"
                onChange={(e) => setForm((f) => ({ ...f, imageFile: e.target.files?.[0] ?? null }))}
              />
              {(imagePreviewUrl || form.existingImageUrl) && (
                <div
                  className="h-28 rounded-md bg-muted bg-cover bg-center mt-2"
                  style={{
                    backgroundImage: `url(${imagePreviewUrl ?? form.existingImageUrl})`,
                  }}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="post-published"
                checked={form.published}
                onCheckedChange={(v) => setForm((f) => ({ ...f, published: v === true }))}
              />
              <Label htmlFor="post-published" className="text-sm font-normal">
                Published (visible to all visitors)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InsightsPage;
