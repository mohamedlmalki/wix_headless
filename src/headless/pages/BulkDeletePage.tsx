import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, RefreshCw, Download, ListChecks, Terminal } from "lucide-react";
import Navbar from '@/components/Navbar';
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Progress } from '@/components/ui/progress';

// Types
interface HeadlessProject {
  projectName: string;
  siteId: string;
  apiKey: string;
}

interface Member {
  id: string;
  loginEmail: string;
  contactId: string;
  profile: {
    nickname: string;
  };
  status?: string;
}

export interface DeleteJobState {
    isDeleteJobRunning: boolean;
    deleteProgress: {
        processed: number;
        total: number;
        step?: string;
        progress?: number;
    };
}

const exportEmailsToTxt = (data: any[], filename: string) => {
    const emails = data.map(row => row.loginEmail).filter(Boolean);
    if (emails.length === 0) {
        alert("No emails to export.");
        return;
    }
    const txtContent = emails.join('\n');
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.txt`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

const BulkDeletePage = () => {
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [isFetchingAllMembers, setIsFetchingAllMembers] = useState(false);
    const [selectedAllMembers, setSelectedAllMembers] = useState<string[]>([]);
    const [allMembersFilterQuery, setAllMembersFilterQuery] = useState("");
    const [deleteJobState, setDeleteJobState] = useState<DeleteJobState>({
        isDeleteJobRunning: false,
        deleteProgress: { processed: 0, total: 0, step: '', progress: 0 },
    });
    const [logs, setLogs] = useState<string[]>([]);
    const { toast } = useToast();
    const pollingIntervalRef = useRef<number | null>(null);
    const logContainerRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prevLogs => [...prevLogs, `[${timestamp}] ${message}`]);
    };

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const response = await fetch('/api/headless-get-config');
                if (response.ok) {
                    const projects = await response.json();
                    setHeadlessProjects(projects);
                    if (projects.length > 0 && !selectedProject) {
                        setSelectedProject(projects[0]);
                    }
                }
            } catch (error) {
                addLog(`Error loading projects: ${(error as Error).message}`);
                toast({ title: "Error", description: "Could not load projects.", variant: "destructive" });
            }
        };
        fetchProjects();
    }, [toast]);

    const stopPolling = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    };

    const startPolling = () => {
        stopPolling();
        
        pollingIntervalRef.current = window.setInterval(async () => {
            if (!selectedProject?.siteId) {
                stopPolling();
                return;
            }
            try {
                const response = await fetch('/api/headless-job-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteId: selectedProject.siteId }),
                });

                if (!response.ok) throw new Error(`Status check failed: ${response.statusText}`);
                const data = await response.json();

                if (data.status === 'running') {
                    if(data.step !== deleteJobState.deleteProgress.step) {
                        addLog(data.step);
                    }
                    const progressValue = data.total > 0 ? (data.processed / data.total) * 100 : 0;
                    setDeleteJobState({
                        isDeleteJobRunning: true,
                        deleteProgress: { ...data, progress: progressValue }
                    });
                } else if (data.status === 'complete') {
                    addLog("Job completed successfully!");
                    setDeleteJobState({
                        isDeleteJobRunning: false,
                        deleteProgress: { processed: data.total, total: data.total, progress: 100, step: 'Complete!' }
                    });
                    toast({ title: "Bulk delete complete!", description: `Successfully removed members and contacts.` });
                    stopPolling();
                } else if (data.status === 'idle') {
                     addLog("Job is now idle. Stopping polling.");
                     setDeleteJobState({ isDeleteJobRunning: false, deleteProgress: { processed: 0, total: 0, step: '', progress: 0 } });
                     stopPolling();
                }
            } catch (error) {
                addLog(`Polling error: ${(error as Error).message}`);
                toast({ title: "Polling Error", description: "Could not get job status. Try resetting the job.", variant: "destructive" });
                stopPolling();
            }
        }, 2500);
    };

    useEffect(() => {
        if (deleteJobState.isDeleteJobRunning) {
            startPolling();
        } else {
            stopPolling();
        }
        return () => stopPolling();
    }, [deleteJobState.isDeleteJobRunning, selectedProject]);
    
    useEffect(() => {
        if (!selectedProject?.siteId) return;
        setDeleteJobState({ isDeleteJobRunning: false, deleteProgress: { processed: 0, total: 0, step: '', progress: 0 } });
        setLogs([]);
        const checkInitialJobStatus = async () => {
            try {
                const response = await fetch('/api/headless-job-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteId: selectedProject.siteId }),
                });
                const data = await response.json();
                if (data.status === 'running') {
                    addLog("Found a job already in progress...");
                    setDeleteJobState({ isDeleteJobRunning: true, deleteProgress: data });
                }
            } catch (error) {
                console.error("Could not check initial job status:", error);
            }
        };
        checkInitialJobStatus();
    }, [selectedProject]);
    
    const handleListAllMembers = async () => {
        if (!selectedProject?.siteId) return;
        setIsFetchingAllMembers(true);
        setAllMembers([]);
        setSelectedAllMembers([]);
        try {
            const response = await fetch('/api/headless-list-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId }),
            });
            if (!response.ok) throw new Error('Failed to fetch the member list.');
            const data = await response.json();
            setAllMembers(data.members || []);
        } catch (error) {
            toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsFetchingAllMembers(false);
        }
    };

    const handleDeleteAllSelected = async () => {
        if (selectedAllMembers.length === 0 || !selectedProject?.siteId) {
            toast({ title: "No members selected or project not found", variant: "destructive" });
            return;
        }

        setLogs([]);
        addLog(`Starting deletion job for ${selectedAllMembers.length} members...`);

        try {
            const membersToDelete = allMembers
                .filter(member => selectedAllMembers.includes(member.id))
                .map(member => ({
                    memberId: member.id,
                    contactId: member.contactId,
                }));

            setDeleteJobState({
                isDeleteJobRunning: true,
                deleteProgress: { processed: 0, total: membersToDelete.length * 2, step: 'Initializing job...', progress: 0 },
            });
            
            const response = await fetch('/api/headless-start-delete-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, membersToDelete }),
            });

            if (!response.ok) {
                let errorMessage = `Failed to start job (Status: ${response.status})`;
                try {
                    const data = await response.json();
                    errorMessage = data.message || JSON.stringify(data);
                } catch (e) {
                     errorMessage = "Failed to start job. The server returned a non-JSON response.";
                }
                throw new Error(errorMessage);
            }

            addLog("Job successfully started on the server. Polling for status...");
            toast({ title: "Deletion Job Started", description: "The process is running in the background." });

            setAllMembers(allMembers.filter(member => !selectedAllMembers.includes(member.id)));
            setSelectedAllMembers([]);

        } catch (error: any) {
            addLog(`Error starting job: ${error.message}`);
            toast({ title: "Error Starting Job", description: error.message, variant: "destructive" });
            setDeleteJobState({ isDeleteJobRunning: false, deleteProgress: { processed: 0, total: 0, step: 'Failed to start', progress: 0 } });
        }
    };

    const handleResetJob = async () => {
        if (!selectedProject?.siteId) return;
        addLog("Attempting to reset job status on the server...");
        try {
            await fetch('/api/headless-reset-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId }),
            });
            setDeleteJobState({
                isDeleteJobRunning: false,
                deleteProgress: { processed: 0, total: 0, step: '', progress: 0 },
            });
            addLog("Job status has been successfully reset.");
            toast({ title: "Job Reset", description: "The deletion job status has been cleared." });
        } catch (error) {
            addLog(`Error resetting job: ${(error as Error).message}`);
            toast({ title: "Error", description: "Could not reset the job status.", variant: "destructive" });
        }
    };
    
    const handleProjectChange = (siteId: string) => {
        const project = headlessProjects.find(p => p.siteId === siteId);
        setSelectedProject(project || null);
        // Reset all states related to the previous project
        setAllMembers([]);
        setSelectedAllMembers([]);
        setAllMembersFilterQuery("");
        setLogs([]);
        setDeleteJobState({
            isDeleteJobRunning: false,
            deleteProgress: { processed: 0, total: 0, step: '', progress: 0 },
        });
    };

    const filteredAllMembers = allMembers.filter(member =>
        member.profile?.nickname?.toLowerCase().includes(allMembersFilterQuery.toLowerCase()) ||
        member.loginEmail.toLowerCase().includes(allMembersFilterQuery.toLowerCase())
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
                            <p className="text-muted-foreground">Select a project to manage and delete members in bulk.</p>
                        </div>
                    </div>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader>
                            <CardTitle>Select Project</CardTitle>
                        </CardHeader>
                        <CardContent className="flex gap-4">
                            <Select onValueChange={handleProjectChange} value={selectedProject?.siteId || ""}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a project..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {headlessProjects.map(project => (
                                        <SelectItem key={project.siteId} value={project.siteId}>
                                            {project.projectName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button onClick={handleListAllMembers} disabled={!selectedProject || isFetchingAllMembers}>
                                <ListChecks className="mr-2 h-4 w-4" />
                                {isFetchingAllMembers ? 'Loading...' : 'Load All Members'}
                            </Button>
                        </CardContent>
                    </Card>

                    {(deleteJobState.isDeleteJobRunning || logs.length > 0) && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                            <CardHeader>
                                <CardTitle>Bulk Deletion in Progress</CardTitle>
                                {deleteJobState.isDeleteJobRunning && (
                                     <CardDescription>
                                        {deleteJobState.deleteProgress.step || 'Initializing...'}
                                    </CardDescription>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {deleteJobState.isDeleteJobRunning && (
                                     <Progress value={deleteJobState.deleteProgress.progress || 0} />
                                )}
                                <div className="flex items-center gap-2">
                                     <Terminal className="h-5 w-5 text-muted-foreground" />
                                     <Label htmlFor="logs">Live Logs</Label>
                                </div>
                                <Textarea
                                    id="logs"
                                    ref={logContainerRef}
                                    readOnly
                                    value={logs.join('\n')}
                                    className="h-40 resize-y bg-black font-mono text-xs text-green-400"
                                    placeholder="Logs will appear here..."
                                />
                            </CardContent>
                        </Card>
                    )}

                    {allMembers.length > 0 && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                            <CardHeader className="flex flex-row justify-between items-center">
                                <div>
                                    <CardTitle>Manage All Members</CardTitle>
                                    <CardDescription>View, select, and delete all members from this site.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input placeholder="Filter results..." value={allMembersFilterQuery} onChange={(e) => setAllMembersFilterQuery(e.target.value)} className="w-40 h-8" />
                                    <Button variant="outline" size="sm" onClick={() => exportEmailsToTxt(filteredAllMembers, 'all-members-emails')}><Download className="mr-2 h-4 w-4"/>Export Emails</Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]">
                                                    <Checkbox
                                                        checked={filteredAllMembers.length > 0 && selectedAllMembers.length === filteredAllMembers.length}
                                                        onCheckedChange={(checked) => {
                                                            const allMemberIds = checked ? filteredAllMembers.map(m => m.id) : [];
                                                            setSelectedAllMembers(allMemberIds);
                                                        }}
                                                    />
                                                </TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAllMembers.map((member) => (
                                                <TableRow key={member.id}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedAllMembers.includes(member.id)}
                                                            onCheckedChange={(checked) => {
                                                                setSelectedAllMembers(prev => checked ? [...prev, member.id] : prev.filter(id => id !== member.id));
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{member.profile?.nickname || 'N/A'}</TableCell>
                                                    <TableCell>{member.loginEmail}</TableCell>
                                                    <TableCell>{member.status}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                             {selectedAllMembers.length > 0 && (
                                <CardFooter className="flex justify-between items-center">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" disabled={deleteJobState.isDeleteJobRunning}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {deleteJobState.isDeleteJobRunning ? 'Job in Progress...' : `Delete (${selectedAllMembers.length}) Selected`}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription>This action will start a background job to delete the selected {selectedAllMembers.length} member(s). You can close the window and the process will continue.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteAllSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, Start Deletion Job</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    {deleteJobState.isDeleteJobRunning && (
                                        <Button variant="outline" onClick={handleResetJob}>
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Reset Stuck Job
                                        </Button>
                                    )}
                                </CardFooter>
                            )}
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

export default BulkDeletePage;