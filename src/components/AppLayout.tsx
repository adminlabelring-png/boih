import { Link, Outlet } from "react-router-dom";
import Logo from "./Logo";
import PillNav from "./PillNav";
import BottomTabBar from "./BottomTabBar";

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <PillNav />
      {/* Phones have no top nav, so the logo here is the way back home. */}
      <header className="md:hidden sticky top-0 z-40 flex h-14 items-center border-b border-border bg-background/95 backdrop-blur-md px-4">
        <Link to="/" aria-label="Labelring home" className="flex items-center min-h-[44px]">
          <Logo iconClassName="h-6 w-6" textClassName="text-base" />
        </Link>
      </header>
      <main className="pt-4 md:pt-24 pb-24 md:pb-10 px-4 md:px-8">
        <div className="max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
      <BottomTabBar />
    </div>
  );
};

export default AppLayout;
