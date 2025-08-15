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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    batch: number;
    status: string;
    details: string;
}

const BulkDeletePage = () => {
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
    const [ownerContactId, setOwnerContactId] = useState<string | null>(null);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [filter, setFilter] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletionProgress, setDeletionProgress] = useState(0);
    const [deletionStatus, setDeletionStatus] = useState("");
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        const fetchProjects = async () => {
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
            }
        };
        fetchProjects();
    }, []);

    // ★★★ FIX: This useEffect now triggers the single, safe data-loading function. ★★★
    useEffect(() => {
        if (selectedProject) {
            handleLoadMembersAndOwner();
        }
    }, [selectedProject]);
    
    // ★★★ FIX: This is now the ONLY function that fetches member data. ★★★
    // It calls the backend 'list' action which securely filters out the owner.
    const handleLoadMembersAndOwner = async () => {
        if (!selectedProject) return;
        setIsLoadingMembers(true);
        setMembers([]);
        setSelectedMembers([]);
        setOwnerContactId(null);
        setLogs([]);
        try {
            const response = await fetch(`/api/headless-bulk-operations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, action: 'list' }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to load members.');
            
            // The backend now provides the pre-filtered member list and the owner's ID
            setMembers(data.members || []);
            setOwnerContactId(data.ownerContactId || null);

        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsLoadingMembers(false);
        }
    };
    
    const handleStartDeletion = async () => {
        if (selectedMembers.length === 0 || !selectedProject) return;

        setIsDeleting(true);
        setLogs([]);
        setDeletionProgress(0);
        setDeletionStatus("Starting deletion job...");

        const membersToDelete = members.filter(m => selectedMembers.includes(m.id));

        try {
            const response = await fetch('/api/headless-bulk-operations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    siteId: selectedProject.siteId, 
                    action: 'delete',
                    membersToDelete // This list is already safe because the owner was filtered out
                }),
            });

            const result = await response.json();
            setLogs(result.logs || []);
            
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Deletion job failed.');
            }

            toast({ title: "Success", description: result.message });
            setDeletionStatus("Job completed successfully.");
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
            setDeletionStatus(`Job failed: ${error.message}`);
        } finally {
            setIsDeleting(false);
            setDeletionProgress(100);
            // Reload the member list after deletion is complete
            handleLoadMembersAndOwner();
        }
    };

    const handleSelectAll = (checked: boolean) => {
        // The filteredMembers list already excludes the owner, so this is safe.
        setSelectedMembers(checked ? filteredMembers.map(m => m.id) : []);
    };
    
    const filteredMembers = members.filter(member =>
        (member.profile?.nickname?.toLowerCase() || '').includes(filter.toLowerCase()) ||
        (member.loginEmail?.toLowerCase() || '').includes(filter.toLowerCase())
    );

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
                                onValueChange={(siteId) => {
                                    setSelectedProject(headlessProjects.find(p => p.siteId === siteId) || null);
                                    setLogs([]);
                                }}
                                disabled={isDeleting}
                            >
                                <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                                <SelectContent>
                                    {headlessProjects.map(project => <SelectItem key={project.siteId} value={project.siteId}>{project.projectName}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>
                    
                    {/* Member Management Table */}
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Manage Members ({filteredMembers.length})</CardTitle>
                                    <CardDescription>Select members to delete. Site contributors are protected and hidden from this list.</CardDescription>
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
                                        {isLoadingMembers ? (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading and filtering members...</TableCell></TableRow>
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
                        <CardFooter className="flex flex-col items-start gap-4">
                             {selectedMembers.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" disabled={isDeleting}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete ({selectedMembers.length}) Selected
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

                    {/* Deletion Job Status and Logs */}
                    {logs.length > 0 && (
                         <Card>
                            <CardHeader><CardTitle>Deletion Job Status</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                {isDeleting && (
                                    <div>
                                        <Progress value={deletionProgress} className="w-full" />
                                        <p className="text-sm text-muted-foreground mt-2">{deletionStatus}</p>
                                    </div>
                                )}
                                <Accordion type="single" collapsible className="w-full" defaultValue="logs">
                                    <AccordionItem value="logs">
                                        <AccordionTrigger>View Detailed Logs</AccordionTrigger>
                                        <AccordionContent className="max-h-60 overflow-y-auto">
                                           {logs.map((log, i) => (
                                               <div key={i} className="text-xs p-2 border-b">
                                                   <p><strong>Type:</strong> {log.type} | <strong>Batch:</strong> {log.batch} | <span className={log.status === 'SUCCESS' ? 'text-green-500' : 'text-red-500'}><strong>Status:</strong> {log.status}</span></p>
                                                   <p><strong>Details:</strong> {log.details}</p>
                                               </div>
                                           ))}
                                        </AccordionContent>
                                    </AccordionItem>
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