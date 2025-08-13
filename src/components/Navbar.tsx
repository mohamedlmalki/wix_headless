import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Server, BarChart2, Trash2 } from "lucide-react"; 

const Navbar = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md border-b border-border z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          WixHeadless
        </Link>
        
        <div className="hidden md:flex items-center gap-4">
          <Link to="/headless-import">
            <Button 
              variant={isActive("/headless-import") ? "default" : "ghost"} 
              size="sm"
              className="gap-2"
            >
              <Server size={16} />
              Headless Import
            </Button>
          </Link>
          <Link to="/campaign-stats">
            <Button 
              variant={isActive("/campaign-stats") ? "default" : "ghost"} 
              size="sm"
              className="gap-2"
            >
              <BarChart2 size={16} />
              Campaign Stats
            </Button>
          </Link>
          <Link to="/bulk-delete">
            <Button 
              variant={isActive("/bulk-delete") ? "default" : "ghost"} 
              size="sm"
              className="gap-2"
            >
              <Trash2 size={16} />
              Bulk Delete
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;