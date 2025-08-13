import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, RefreshCw, Download, ListChecks, PlayCircle, PauseCircle, XCircle, CheckCircle } from "lucide-react";
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
  ownerEmail?: string;
}

interface Member {
  id: string;
  loginEmail: string;
  contactId: string;
  profile: { nickname: string; };
  status?: string;
}

interface DeleteResult {
    email: string;
    status: 'Success' | 'Failed';
    message: string;
}

const BulkDeletePage = () => {
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [isFetchingAllMembers, setIsFetchingAllMembers] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [filterQuery, setFilterQuery] = useState("");
    const { toast } = useToast();

    // Client-side job state
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(0);
    const [deleteResults, setDeleteResults] = useState<DeleteResult[]>([]);
    const [processedCount, setProcessedCount] = useState(0);

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
    }, [toast]);


    const handleListAllMembers = async () => {
        if (!selectedProject) return;
        setIsFetchingAllMembers(true);
        setAllMembers([]);
        setSelectedMembers([]);
        try {
            const response = await fetch('/api/headless-list-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId }),
            });
            if (!response.ok) throw new Error('Failed to fetch the member list.');
            const data = await response.json();
            
            let members = data.members || [];
            if (selectedProject.ownerEmail) {
                members = members.filter(member => member.loginEmail.toLowerCase() !== selectedProject.ownerEmail.toLowerCase());
            }
            setAllMembers(members);

        } catch (error) {
            toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsFetchingAllMembers(false);
        }
    };
    
    const handleStartDeletion = async () => {
        if (selectedMembers.length === 0 || !selectedProject) {
            toast({ title: "No members selected", variant: "destructive" });
            return;
        }

        setIsDeleting(true);
        setIsPaused(false);
        setDeleteResults([]);
        setProcessedCount(0);

        const membersToDelete = allMembers.filter(m => selectedMembers.includes(m.id));
        const totalToDelete = membersToDelete.length;

        for (let i = 0; i < totalToDelete; i++) {
            // Check if paused
            if (isPaused) {
                // To truly pause, we need to handle this state.
                // For now, we just stop the loop. A resume would need to pick up from here.
                setIsDeleting(false);
                return;
            }

            const member = membersToDelete[i];
            
            try {
                const response = await fetch('/api/headless-delete-member', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        siteId: selectedProject.siteId,
                        memberId: member.id,
                        contactId: member.contactId,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to delete member.');
                }
                
                setDeleteResults(prev => [...prev, { email: member.loginEmail, status: 'Success', message: 'Deleted successfully.' }]);
            } catch (error) {
                 setDeleteResults(prev => [...prev, { email: member.loginEmail, status: 'Failed', message: (error as Error).message }]);
            }

            const currentProcessed = i + 1;
            setProcessedCount(currentProcessed);
            setDeleteProgress((currentProcessed / totalToDelete) * 100);
        }

        setIsDeleting(false);
        toast({ title: "Bulk Delete Complete", description: `Finished processing ${totalToDelete} members.`});
    };


    const filteredMembers = allMembers.filter(member =>
        member.profile?.nickname?.toLowerCase().includes(filterQuery.toLowerCase()) ||
        member.loginEmail.toLowerCase().includes(filterQuery.toLowerCase())
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
                        <CardHeader><CardTitle>Select Project</CardTitle></CardHeader>
                        <CardContent className="flex gap-4">
                            <Select 
                                onValueChange={(siteId) => {
                                    const project = headlessProjects.find(p => p.siteId === siteId);
                                    setSelectedProject(project || null);
                                    setAllMembers([]);
                                    setSelectedMembers([]);
                                }}
                                value={selectedProject?.siteId}
                            >
                                <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
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

                    {isDeleting && (
                         <Card className="bg-gradient-card shadow-card border-primary/10">
                            <CardHeader>
                                <CardTitle>Deletion in Progress...</CardTitle>
                                <CardDescription>
                                    Processing {processedCount} of {selectedMembers.length} members. Please keep this tab open.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Progress value={deleteProgress} />
                            </CardContent>
                        </Card>
                    )}

                    {allMembers.length > 0 && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                            <CardHeader className="flex flex-row justify-between items-center">
                                <div>
                                    <CardTitle>Manage All Members</CardTitle>
                                    <CardDescription>View, select, and delete members from this site.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input placeholder="Filter results..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} className="w-40 h-8" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]">
                                                    <Checkbox 
                                                        checked={filteredMembers.length > 0 && selectedMembers.length === filteredMembers.length}
                                                        onCheckedChange={(checked) => {
                                                            setSelectedMembers(checked ? filteredMembers.map(m => m.id) : []);
                                                        }}
                                                    />
                                                </TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredMembers.map((member) => (
                                                <TableRow key={member.id} data-state={selectedMembers.includes(member.id) && "selected"}>
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
                                                    <TableCell>{member.status}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                             {selectedMembers.length > 0 && (
                                <CardFooter>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" disabled={isDeleting}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {isDeleting ? 'Processing...' : `Delete (${selectedMembers.length}) Selected`}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>This will start deleting the selected {selectedMembers.length} member(s). This action cannot be stopped once started, and you must keep this browser tab open.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleStartDeletion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, Start Deletion</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardFooter>
                            )}
                        </Card>
                    )}

                    {deleteResults.length > 0 && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                            <CardHeader>
                                <CardTitle>Deletion Results</CardTitle>
                            </CardHeader>
                            <CardContent className="max-h-[40vh] overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Message</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {deleteResults.map((result, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{result.email}</TableCell>
                                                <TableCell>
                                                    {result.status === 'Success' ? 
                                                        <span className="flex items-center gap-2 text-green-500"><CheckCircle className="h-4 w-4" /> Success</span> : 
                                                        <span className="flex items-center gap-2 text-red-500"><XCircle className="h-4 w-4" /> Failed</span>
                                                    }
                                                </TableCell>
                                                <TableCell>{result.message}</TableCell>
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
}

export default BulkDeletePage;