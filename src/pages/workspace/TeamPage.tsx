import { Users } from "lucide-react";

const TeamPage = () => (
  <div className="space-y-4 max-w-2xl">
    <div>
      <h1 className="text-lg font-semibold">Team</h1>
      <p className="text-sm text-muted-foreground mt-0.5">Workspace members</p>
    </div>
    <div className="rounded-lg border bg-card p-10 text-center">
      <Users className="h-8 w-8 mx-auto text-muted-foreground" />
      <p className="text-sm font-medium mt-3">Team members arrive with brand accounts</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">For now only Labelring admins can open the workspace. Approvals are attributed to the reviewer name entered at approval time.</p>
    </div>
  </div>
);

export default TeamPage;
