// src/headless/pages/BulkDeletePage.tsx

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Trash2, RefreshCw, Ban } from "lucide-react";
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
    type: 'Member Deletion' | 'Contact Deletion';
    batch: number;
    status: 'SUCCESS' | 'ERROR' | 'PARTIAL_SUCCESS';
    details: string;
    contactResults?: { email: string; status: 'SUCCESS' | 'ERROR'; error?: string }[];
}

const BulkDeletePage = () => {
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
    const [ownerContactId, setOwnerContactId] = useState<string | null>(null);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [filter, setFilter] = useState("");

    // Job State Management
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletionProgress, setDeletionProgress] = useState(0);
    const [deletionStatus, setDeletionStatus] = useState("");
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const jobCancelled = useRef(false);
    
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const response = await fetch('/api/headless-get-config');
                if (response.ok) {
                    const projects = await response.json();
                    setHeadlessProjects(projects);
                    if (projects.length > 0) {
                        setSelectedProject(projects[0]);
                    }
                }
            } catch (error) {
                toast({ title: "Error", description: "Could not load projects.", variant: "destructive" });
            }
        };
        fetchProjects();
    }, []);

    const fetchOwnerId = async (siteId: string) => {
        if (!siteId) return;
        try {
            // This assumes an endpoint exists to get the owner. 
            // Based on your files, this logic needs to be implemented in your backend.
            // For now, we'll simulate not finding it.
            console.warn("Owner detection logic needs a backend endpoint.");
            setOwnerContactId(null);
        } catch (error) {
            toast({ title: "Failed to identify site owner.", description: "Owner contact will not be protected from deletion.", variant: "destructive"});
            setOwnerContactId(null);
        }
    };
    
    useEffect(() => {
        if (selectedProject) {
            fetchOwnerId(selectedProject.siteId);
            handleLoadMembers();
        }
    }, [selectedProject]);


    const handleLoadMembers = async () => {
        if (!selectedProject) return;
        setIsLoadingMembers(true);
        setMembers([]);
        setSelectedMembers([]);
        try {
            const response = await fetch(`/api/headless-list-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to load members.');
            }

            const data = await response.json();
            setMembers(data.members || []);
            toast({ title: "Success", description: `Successfully loaded ${data.members?.length || 0} members.` });

        } catch (error: any) {
             toast({ title: "Failed to load members.", description: error.message, variant: "destructive" });
        } finally {
            setIsLoadingMembers(false);
        }
    };
    
    const handleStartDeletion = async () => {
        if (selectedMembers.length === 0 || !selectedProject) return;
        
        jobCancelled.current = false;
        setIsDeleting(true);
        setLogs([]);
        setDeletionProgress(0);
        
        const membersToDelete = members.filter(m => selectedMembers.includes(m.id));
        
        try {
            const response = await fetch('/api/headless-start-delete-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, membersToDelete }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || result.message || 'An unknown error occurred.');
            }
            
            setLogs(result.logs || []);
            setDeletionProgress(100);
            setDeletionStatus("Deletion process completed.");
            toast({ title: "Job Finished", description: `Processed ${membersToDelete.length} members.` });

        } catch(error: any) {
            toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
            setDeletionStatus(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
            handleLoadMembers(); // Refresh list
        }
    };
    
    const handleCancelJob = () => {
        jobCancelled.current = true;
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedMembers(filteredMembers.filter(m => m.contactId !== ownerContactId).map(m => m.id));
        } else {
            setSelectedMembers([]);
        }
    };

    const handleSelectMember = (memberId: string, checked: boolean) => {
        if (checked) {
            setSelectedMembers(prev => [...prev, memberId]);
        } else {
            setSelectedMembers(prev => prev.filter(id => id !== memberId));
        }
    };

    const filteredMembers = members.filter(member =>
        member.profile?.nickname?.toLowerCase().includes(filter.toLowerCase()) ||
        member.loginEmail?.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gradient-subtle">
            <Navbar />
            <div className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="flex items-center gap-4 animate-fade-in">
                        <Trash2 className="h-10 w-10 text-destructive" />
                        <div>
                            <h1 className="text-3xl font-bold">Bulk Delete Members</h1>
                            <p className="text-muted-foreground">Select a project and load members to begin deletion.</p>
                        </div>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Project Selection</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-center gap-4">
                            <Select 
                                value={selectedProject?.siteId || ""} 
                                onValueChange={(siteId) => setSelectedProject(headlessProjects.find(p => p.siteId === siteId) || null)} 
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a project..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {headlessProjects.map(site => <SelectItem key={site.siteId} value={site.siteId}>{site.projectName}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Button onClick={handleLoadMembers} disabled={isLoadingMembers || !selectedProject}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
                                {isLoadingMembers ? "Loading..." : "Load Members"}
                            </Button>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Manage Members ({filteredMembers.length})</CardTitle>
                                    <CardDescription>Select members from the list to include in the bulk deletion.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input 
                                        placeholder="Filter results..."
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                        className="w-48"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead className="w-[50px]">
                                                <Checkbox
                                                    checked={filteredMembers.length > 0 && selectedMembers.length > 0 && selectedMembers.length === filteredMembers.filter(m => m.contactId !== ownerContactId).length}
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
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center">Loading members...</TableCell>
                                            </TableRow>
                                        ) : filteredMembers.length > 0 ? (
                                            filteredMembers.map(member => {
                                                const isOwner = member.contactId === ownerContactId;
                                                return (
                                                <TableRow key={member.id} className={isOwner ? "opacity-50" : ""}>
                                                    <TableCell>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <span tabIndex={0}>
                                                                        <Checkbox 
                                                                            checked={selectedMembers.includes(member.id)}
                                                                            onCheckedChange={(checked) => handleSelectMember(member.id, Boolean(checked))}
                                                                            disabled={isOwner}
                                                                        />
                                                                    </span>
                                                                </TooltipTrigger>
                                                                {isOwner && <TooltipContent><p>Site owner cannot be deleted.</p></TooltipContent>}
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </TableCell>
                                                    <TableCell>{member.profile?.nickname || 'N/A'}</TableCell>
                                                    <TableCell>{member.loginEmail}</TableCell>
                                                    <TableCell><Badge variant="outline">{member.status}</Badge></TableCell>
                                                </TableRow>
                                            )})
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                    No members loaded.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                         <CardFooter className="flex flex-col items-start gap-4">
                            <div className="flex items-center gap-4">
                                {selectedMembers.length > 0 && !isDeleting && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete ({selectedMembers.length}) Selected
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete the selected {selectedMembers.length} member(s) and their associated contacts. This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleStartDeletion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                    Yes, Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                                {isDeleting && (
                                    <Button variant="destructive" onClick={handleCancelJob}>
                                        <Ban className="mr-2 h-4 w-4" />
                                        Cancel Job
                                    </Button>
                                )}
                            </div>
                            {(isDeleting || logs.length > 0) && (
                                <div className="w-full space-y-4">
                                    {isDeleting && (
                                        <div>
                                            <Progress value={deletionProgress} className="w-full" />
                                            <p className="text-sm text-muted-foreground mt-2">{deletionStatus}</p>
                                        </div>
                                    )}
                                    <Card>
                                        <CardHeader><CardTitle>Deletion Logs</CardTitle></CardHeader>
                                        <CardContent className="max-h-60 overflow-y-auto">
                                            <Accordion type="multiple" className="w-full">
                                                {logs.map((log, i) => (
                                                    <AccordionItem value={`item-${i}`} key={i} className="border-b last:border-b-0">
                                                        <AccordionTrigger className="p-4 hover:no-underline text-sm">
                                                            <div className="flex items-center justify-between w-full">
                                                                <div className="flex items-center gap-4">
                                                                    <span>Batch {log.batch}</span>
                                                                    <span>{log.type}</span>
                                                                    <span className={log.status === 'SUCCESS' ? 'text-green-500' : 'text-red-500'}>{log.status}</span>
                                                                </div>
                                                                <span>{log.details}</span>
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent className="bg-muted/50 p-4">
                                                            {log.contactResults && log.contactResults.length > 0 ? (
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead>Email</TableHead>
                                                                            <TableHead>Status</TableHead>
                                                                            <TableHead>Error Details</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {log.contactResults.map((result, j) => (
                                                                            <TableRow key={j}>
                                                                                <TableCell>{result.email}</TableCell>
                                                                                <TableCell className={result.status === 'SUCCESS' ? 'text-green-500' : 'text-red-500'}>{result.status}</TableCell>
                                                                                <TableCell className="text-red-500">{result.error}</TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            ) : (
                                                                <p className="text-sm text-muted-foreground">No detailed contact results for this batch.</p>
                                                            )}
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                ))}
                                            </Accordion>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default BulkDeletePage;