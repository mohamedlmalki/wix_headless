// src/headless/pages/BulkDeletePage.tsx

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Trash2, RefreshCw } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface HeadlessProject {
  projectName: string;
  siteId: string;
  apiKey: string;
  ownerEmail?: string;
}

interface Member {
  id: string;
  loginEmail: string;
  contactId: string;
  profile: { nickname: string; };
  status?: string;
}

interface LogEntry {
    type: string;
    status: string;
    details: string;
}

const BulkDeletePage = () => {
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [filter, setFilter] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        const fetchProjects = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/headless-get-config');
                if (!response.ok) throw new Error('Failed to fetch projects');
                const projects = await response.json();
                setHeadlessProjects(projects);
                if (projects.length > 0) {
                    setSelectedProject(projects[0]);
                }
            } catch (error) {
                toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchProjects();
    }, []);

    const handleLoadMembers = async () => {
        if (!selectedProject) return;
        setIsLoading(true);
        setMembers([]);
        setSelectedMembers([]);
        setLogs([]); // Clear logs when starting a new load
        try {
            const response = await fetch(`/api/headless-bulk-operations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, action: 'list' }),
            });

            const data = await response.json();
            setLogs(data.logs || []); // Display logs from the loading process
            if (!response.ok) throw new Error(data.error || 'Failed to load members.');
            
            setMembers(data.members || []);
            
        } catch (error: any) {
            toast({ title: "Error Loading Members", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        if (selectedProject) {
            handleLoadMembers();
        }
    }, [selectedProject]);
    
    const handleStartDeletion = async () => {
        if (selectedMembers.length === 0 || !selectedProject) return;
        setIsDeleting(true);
        setLogs([]); 
        const membersToDelete = members.filter(m => selectedMembers.includes(m.id));

        try {
            const response = await fetch('/api/headless-bulk-operations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    siteId: selectedProject.siteId, 
                    action: 'delete',
                    membersToDelete 
                }),
            });

            const result = await response.json();
            setLogs(result.logs || []); 
            
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Deletion job failed.');
            }
            toast({ title: "Success", description: result.message });
            handleLoadMembers(); 
        } catch (error: any) {
            toast({ title: "Error During Deletion", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectedMembers(checked ? filteredMembers.map(m => m.id) : []);
    };
    
    const filteredMembers = members.filter(member =>
        (member.profile?.nickname?.toLowerCase() || '').includes(filter.toLowerCase()) ||
        (member.loginEmail?.toLowerCase() || '').includes(filter.toLowerCase())
    );

    const getStatusColor = (status: string) => {
        if (status.includes('SUCCESS')) return 'text-green-500';
        if (status.includes('FAILED') || status.includes('ERROR')) return 'text-red-500';
        if (status.includes('WARNING') || status.includes('SKIPPED')) return 'text-yellow-500';
        return 'text-muted-foreground';
    };

    return (
        <div className="min-h-screen bg-gradient-subtle">
            <Navbar />
            <div className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="flex items-center gap-4 animate-fade-in">
                        <Trash2 className="h-10 w-10 text-destructive" />
                        <div>
                            <h1 className="text-3xl font-bold">Bulk Delete Members</h1>
                            <p className="text-muted-foreground">Select a project to manage its members.</p>
                        </div>
                    </div>
                    <Card>
                        <CardHeader><CardTitle>Project Selection</CardTitle></CardHeader>
                        <CardContent className="flex items-center gap-4">
                            <Select 
                                value={selectedProject?.siteId || ""} 
                                onValueChange={(siteId) => setSelectedProject(headlessProjects.find(p => p.siteId === siteId) || null)}
                                disabled={isDeleting}
                            >
                                <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                                <SelectContent>
                                    {headlessProjects.map(project => <SelectItem key={project.siteId} value={project.siteId}>{project.projectName}</SelectItem>)}
                                </SelectContent>
                            </Select>
                             <Button onClick={handleLoadMembers} disabled={isLoading || !selectedProject}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                {isLoading ? "Loading..." : "Reload List"}
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Manage Members ({filteredMembers.length})</CardTitle>
                                    <CardDescription>Select members to delete. The site owner is protected and hidden from this list.</CardDescription>
                                </div>
                                <Input 
                                    placeholder="Filter members..."
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="w-48"
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead className="w-[50px]">
                                                <Checkbox
                                                    checked={filteredMembers.length > 0 && selectedMembers.length > 0 && selectedMembers.length === filteredMembers.length}
                                                    onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                                                />
                                            </TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading members...</TableCell></TableRow>
                                        ) : filteredMembers.length > 0 ? (
                                            filteredMembers.map(member => (
                                                <TableRow key={member.id}>
                                                    <TableCell>
                                                        <Checkbox 
                                                            checked={selectedMembers.includes(member.id)}
                                                            onCheckedChange={(checked) => {
                                                                setSelectedMembers(prev => checked ? [...prev, member.id] : prev.filter(id => id !== member.id));
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{member.profile?.nickname || 'N/A'}</TableCell>
                                                    <TableCell>{member.loginEmail}</TableCell>
                                                    <TableCell><Badge variant="outline">{member.status}</Badge></TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No deletable members found.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                        <CardFooter>
                             {selectedMembers.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" disabled={isDeleting}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            {isDeleting ? 'Deleting...' : `Delete (${selectedMembers.length}) Selected`}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete the selected {selectedMembers.length} members and their contacts. This cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleStartDeletion} className="bg-destructive hover:bg-destructive/90">
                                                Yes, Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </CardFooter>
                    </Card>
                    {logs.length > 0 && (
                         <Card>
                            <CardHeader><CardTitle>Operation Logs</CardTitle></CardHeader>
                            <CardContent className="max-h-80 overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Step</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {logs.map((log, i) => (
                                            <TableRow key={i}>
                                                <TableCell>{log.type}</TableCell>
                                                <TableCell className={getStatusColor(log.status)}>
                                                    <Badge variant={log.status.includes('SUCCESS') ? 'default' : log.status.includes('FAILED') ? 'destructive' : 'secondary'}>{log.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-xs">{log.details}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkDeletePage;