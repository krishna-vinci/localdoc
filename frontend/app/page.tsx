import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen, FileText, Settings, RefreshCw } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">LocalDocs Hub</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search Bar */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            className="pl-10 h-12 text-lg"
            placeholder="Search your documents..."
            type="search"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card border rounded-lg p-4">
            <div className="text-3xl font-bold text-primary">0</div>
            <div className="text-sm text-muted-foreground">Documents</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-3xl font-bold text-primary">0</div>
            <div className="text-sm text-muted-foreground">Folders</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-3xl font-bold text-primary">0</div>
            <div className="text-sm text-muted-foreground">Tags</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Button className="h-24 flex flex-col gap-2" variant="outline">
            <FolderOpen className="h-8 w-8" />
            <span>Add Folder</span>
          </Button>
          <Button className="h-24 flex flex-col gap-2" variant="outline">
            <FileText className="h-8 w-8" />
            <span>View All Documents</span>
          </Button>
        </div>

        {/* Recent Documents */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Recent Documents</h2>
          <div className="text-center py-12 text-muted-foreground border rounded-lg">
            No documents yet. Add a folder to get started.
          </div>
        </section>
      </div>
    </main>
  );
}
