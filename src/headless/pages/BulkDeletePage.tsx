// src/headless/pages/BulkDeletePage.tsx

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, RefreshCw, Download, ListChecks, Terminal, AlertTriangle } from "lucide-react";
import Navbar from '@/components/Navbar';
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// Types
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

const exportEmailsToTxt = (data: any[], filename: string) => {
    const emails = data.map(row => row.loginEmail).filter(Boolean);
    if (emails.length === 0) {
        alert("No emails to export.");
        return;
    }
    const txtContent = emails.join('\n');
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const BulkDeletePage = () => {
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [isFetchingAllMembers, setIsFetchingAllMembers] = useState(false);
    const [selectedAllMembers, setSelectedAllMembers] = useState<string[]>([]);
    const [allMembersFilterQuery, setAllMembersFilterQuery] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const { toast } = useToast();
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
    }, []);

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
            return;
        }

        setIsDeleting(true);
        setLogs([]); // Clear previous logs
        addLog(`Starting deletion job for ${selectedAllMembers.length} members... Please wait, this may take some time.`);

        try {
            const membersToDelete = allMembers
                .filter(member => selectedAllMembers.includes(member.id))
                .map(member => ({ memberId: member.id, contactId: member.contactId }));

            // **THIS IS THE PROOF**: Log the exact count being sent to the backend.
            console.log(`Sending ${membersToDelete.length} members to the backend for deletion.`);
            addLog(`Sending ${membersToDelete.length} members to the backend...`);

            const response = await fetch('/api/headless-start-delete-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, membersToDelete }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || result.message || "An unknown backend error occurred.");
            }

            addLog(`SUCCESS: ${result.message}`);
            toast({ title: "Deletion Complete", description: result.message });
            // Refresh the list to show the result
            handleListAllMembers();

        } catch (error: any) {
            addLog(`FATAL ERROR: ${error.message}`);
            toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleProjectChange = (siteId: string) => {
        const project = headlessProjects.find(p => p.siteId === siteId);
        if (project) {
            setSelectedProject(project);
            setAllMembers([]);
            setSelectedAllMembers([]);
            setAllMembersFilterQuery("");
            setLogs([]);
            setIsDeleting(false);
        }
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
                            <p className="text-muted-foreground">Select a project and load members to begin deletion.</p>
                        </div>
                    </div>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader><CardTitle>Project Selection</CardTitle></CardHeader>
                        <CardContent className="flex flex-col sm:flex-row gap-4">
                            <Select 
                                onValueChange={handleProjectChange} 
                                value={selectedProject?.siteId || ""}
                                disabled={isDeleting}
                            >
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
                            <Button className="w-full sm:w-auto" onClick={handleListAllMembers} disabled={!selectedProject || isFetchingAllMembers || isDeleting}>
                                <ListChecks className="mr-2 h-4 w-4" />
                                {isFetchingAllMembers ? 'Loading...' : 'Load Members'}
                            </Button>
                        </CardContent>
                    </Card>

                    {(isDeleting || logs.length > 0) && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Terminal className="h-5 w-5" />
                                    Deletion Job Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
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
                            <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div>
                                    <CardTitle>Manage Members ({allMembers.length})</CardTitle>
                                    <CardDescription>Select members from the list to include in the bulk deletion.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <Input placeholder="Filter results..." value={allMembersFilterQuery} onChange={(e) => setAllMembersFilterQuery(e.target.value)} className="w-full sm:w-40 h-8" />
                                    <Button variant="outline" size="sm" onClick={() => exportEmailsToTxt(filteredAllMembers, 'all-members-emails')}><Download className="mr-2 h-4 w-4"/>Export</Button>
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
                                                        aria-label="Select all"
                                                    />
                                                </TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAllMembers.map((member) => (
                                                <TableRow key={member.id} data-state={selectedAllMembers.includes(member.id) && "selected"}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedAllMembers.includes(member.id)}
                                                            onCheckedChange={(checked) => {
                                                                setSelectedAllMembers(prev => checked ? [...prev, member.id] : prev.filter(id => id !== member.id));
                                                            }}
                                                            aria-label={`Select ${member.loginEmail}`}
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
                                <CardFooter>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" disabled={isDeleting}>
                                                {isDeleting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                {isDeleting ? 'Deleting...' : `Delete (${selectedAllMembers.length}) Selected`}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription>This will permanently delete the selected {selectedAllMembers.length} members. This action cannot be undone and may take a while to complete.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteAllSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, Start Deletion</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
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