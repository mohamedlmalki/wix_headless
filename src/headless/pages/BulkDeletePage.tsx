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
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
    batch?: number;
    members?: Member[];
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
    const [deletionProgress, setDeletionProgress] = useState(0);
    const [deletionStatus, setDeletionStatus] = useState("");


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
        setLogs([]);
        try {
            const response = await fetch(`/api/headless-bulk-operations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, action: 'list' }),
            });
            const data = await response.json();
            if (!response.ok) {
                setLogs(data.logs || [{type: "Error", status: "FAILED", details: data.error || "An unknown error occurred."}]);
                throw new Error(data.error || 'Failed to load members.');
            }
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
        setDeletionProgress(10);
        setDeletionStatus("Initiating job...");

        const membersToDelete = members.filter(m => selectedMembers.includes(m.id));

        try {
            // Simulate progress for better user experience
            setTimeout(() => {
                if(isDeleting){ // Check if job is still running
                    setDeletionProgress(45);
                    setDeletionStatus("Processing batches on the server...");
                }
            }, 1200);

            const response = await fetch('/api/headless-bulk-operations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    siteId: selectedProject.siteId, 
                    action: 'delete',
                    membersToDelete 
                }),
            });
            
            setDeletionProgress(100);
            const result = await response.json();
            setLogs(result.logs || []); 
            
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Deletion job failed.');
            }

            setDeletionStatus("Job completed successfully!");
            toast({ title: "Success", description: result.message });
            
        } catch (error: any) {
            setDeletionStatus(`Job failed: ${error.message}`);
            toast({ title: "Error During Deletion", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
            // After the job is done, we don't clear logs or reload members automatically.
            // This allows the user to review the results. They can click "Reload List" manually.
        }
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectedMembers(checked ? filteredMembers.map(m => m.id) : []);
    };
    
    const filteredMembers = members.filter(member =>
        (member.profile?.nickname?.toLowerCase() || '').includes(filter.toLowerCase()) ||
        (member.loginEmail?.toLowerCase() || '').includes(filter.toLowerCase())
    );

    const getStatusVariant = (status: string): "default" | "destructive" | "secondary" => {
        if (status.includes('SUCCESS') || status.includes('COMPLETED')) return 'default';
        if (status.includes('FAILED') || status.includes('ERROR')) return 'destructive';
        return 'secondary';
    };

    return (
        <div className="min-h-screen bg-gradient-subtle">
            <Navbar />
            <div className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header and Project Selection */}
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
                             <Button onClick={handleLoadMembers} disabled={isLoading || !selectedProject || isDeleting}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                {isLoading ? "Loading..." : "Reload List"}
                            </Button>
                        </CardContent>
                    </Card>
                    
                    {/* Member Management */}
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
                                                    disabled={isDeleting}
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
                                                <TableRow key={member.id} className={isDeleting ? "opacity-50" : ""}>
                                                    <TableCell>
                                                        <Checkbox 
                                                            checked={selectedMembers.includes(member.id)}
                                                            onCheckedChange={(checked) => {
                                                                setSelectedMembers(prev => checked ? [...prev, member.id] : prev.filter(id => id !== member.id));
                                                            }}
                                                            disabled={isDeleting}
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
                                                This will permanently delete {selectedMembers.length} members and their contacts. This cannot be undone.
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

                    {/* ★★★ NEW Progress and Accordion Log Display ★★★ */}
                    {(isDeleting || logs.length > 0) && (
                         <Card>
                            <CardHeader>
                                <CardTitle>Operation Status & Logs</CardTitle>
                                {isDeleting && (
                                    <div className="pt-2 space-y-2">
                                        <Progress value={deletionProgress} />
                                        <p className="text-sm text-muted-foreground text-center">{deletionStatus}</p>
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent>
                                <Accordion type="multiple" className="w-full">
                                    {logs.map((log, i) => (
                                        <AccordionItem value={`log-${i}`} key={i}>
                                            <AccordionTrigger className="text-sm font-medium hover:no-underline">
                                                <div className="flex items-center gap-4 w-full text-left">
                                                    <span>Batch {log.batch || 'N/A'}</span>
                                                    <span>{log.type}</span>
                                                    <Badge variant={getStatusVariant(log.status)}>{log.status}</Badge>
                                                    <span className="flex-1 text-right text-muted-foreground text-xs pr-4">{log.details}</span>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                {log.members && log.members.length > 0 && (
                                                    <div className="max-h-48 overflow-y-auto p-2 border rounded-md">
                                                        <Table>
                                                            <TableHeader><TableRow><TableHead>Email</TableHead></TableRow></TableHeader>
                                                            <TableBody>
                                                                {log.members.map(member => (
                                                                    <TableRow key={member.id}><TableCell className="text-xs">{member.loginEmail}</TableCell></TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                )}
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkDeletePage;