// src/pages/WebhookTestPage.tsx

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Webhook, Send, RefreshCw, PlusCircle, Pencil, Trash2, PauseCircle, PlayCircle, StopCircle, CheckCircle, XCircle, FileJson, Download } from "lucide-react";
import Navbar from '@/components/Navbar';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { HeadlessProject, WebhookJobState } from '@/App';
import { Badge } from "@/components/ui/badge";
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CampaignField = { id: number; key: string; value: string; };

interface WebhookTestPageProps {
    headlessProjects: HeadlessProject[];
    selectedProject: HeadlessProject | null;
    setHeadlessProjects: (projects: HeadlessProject[]) => void;
    setSelectedProject: (project: HeadlessProject | null) => void;
    webhookJobs: Record<string, WebhookJobState>;
    setWebhookJobs: (jobs: Record<string, WebhookJobState>) => void;
}

const WebhookTestPage = ({
    headlessProjects,
    selectedProject,
    setHeadlessProjects,
    setSelectedProject,
    webhookJobs,
    setWebhookJobs
}: WebhookTestPageProps) => {
    const { toast } = useToast();

    const [emails, setEmails] = useState('');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [importFilter, setImportFilter] = useState<'all' | 'Success' | 'Failed'>('all');

    const [isProjectDialogOpen, setProjectDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [projectName, setProjectName] = useState("");
    const [siteId, setSiteId] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [originalSiteId, setOriginalSiteId] = useState("");
    const [campaignFields, setCampaignFields] = useState<CampaignField[]>([{ id: 1, key: '', value: '' }]);

    const currentJob = selectedProject ? webhookJobs[selectedProject.siteId] : undefined;

    useEffect(() => {
        if (!currentJob?.isRunning || !selectedProject) return;

        const intervalId = setInterval(async () => {
            try {
                const response = await fetch('/api/headless-webhook-job-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteId: selectedProject.siteId }),
                });
                const data = await response.json();

                if (data.status === 'running' || data.status === 'paused' || data.status === 'complete' || data.status === 'canceled') {
                    setWebhookJobs(prev => ({
                        ...prev,
                        [selectedProject.siteId]: {
                            isRunning: data.status === 'running' || data.status === 'paused',
                            isPaused: data.status === 'paused',
                            processed: data.processed,
                            total: data.total,
                            progress: (data.processed / data.total) * 100,
                            results: data.results || [],
                        }
                    }));
                    if (data.status === 'complete') {
                        toast({ title: "Webhook Job Complete!", description: `Finished sending to ${data.total} emails.` });
                    }
                    if (data.status === 'canceled') {
                        toast({ title: "Webhook Job Canceled", description: "The job has been stopped." });
                    }
                } else if (data.status === 'stuck') {
                     setWebhookJobs(prev => ({...prev, [selectedProject.siteId]: { ...prev[selectedProject.siteId], isRunning: false }}));
                     toast({ title: "Job Failed", description: data.error, variant: "destructive" });
                }

            } catch (error) {
                console.error("Failed to fetch webhook job status:", error);
            }
        }, 1500); // <-- Changed from 3000 to 1500

        return () => clearInterval(intervalId);
    }, [currentJob?.isRunning, selectedProject, setWebhookJobs, toast]);

    const handleOpenDialog = (mode: 'add' | 'edit') => {
        setDialogMode(mode);
        if (mode === 'edit' && selectedProject) {
            setProjectName(selectedProject.projectName); setSiteId(selectedProject.siteId);
            setOriginalSiteId(selectedProject.siteId); setApiKey(selectedProject.apiKey);
            setWebhookUrl(selectedProject.webhookUrl || "");
            const campaignsArray = selectedProject.campaigns ? Object.entries(selectedProject.campaigns).map(([key, value], index) => ({ id: index, key, value })) : [];
            setCampaignFields(campaignsArray.length > 0 ? campaignsArray : [{ id: 0, key: '', value: '' }]);
        } else {
            setProjectName(""); setSiteId(""); setApiKey(""); setWebhookUrl("");
            setCampaignFields([{ id: 0, key: '', value: '' }]); setOriginalSiteId("");
        }
        setProjectDialogOpen(true);
    };

    const handleSaveProject = async () => {
        if (!projectName || !siteId || !apiKey) {
            toast({ title: "Missing Fields", description: "Project Name, Site ID, and API Key are required.", variant: "destructive" });
            return;
        }
        const campaignsObject = campaignFields.reduce((acc, field) => {
            if (field.key && field.value) { acc[field.key] = field.value; }
            return acc;
        }, {} as { [key: string]: string });
        const projectData: HeadlessProject = { projectName, siteId, apiKey, webhookUrl, campaigns: campaignsObject };
        let updatedConfig: HeadlessProject[];
        if (dialogMode === 'edit') {
            updatedConfig = headlessProjects.map(p => (p.siteId === originalSiteId ? projectData : p));
        } else {
            if (headlessProjects.some(p => p.siteId === siteId)) {
                toast({ title: "Duplicate Site ID", variant: "destructive" }); return;
            }
            updatedConfig = [...headlessProjects, projectData];
        }
        try {
            await fetch('/api/headless-update-config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: updatedConfig }),
            });
            toast({ title: "Success", description: `Project "${projectName}" saved.` });
            setHeadlessProjects(updatedConfig);
            setSelectedProject(projectData);
            setProjectDialogOpen(false);
        } catch (error) {
            toast({ title: "Error Saving Project", description: (error as Error).message, variant: "destructive" });
        }
    };

    const handleDeleteProject = async () => {
        if (!selectedProject) return;
        const updatedConfig = headlessProjects.filter(p => p.siteId !== selectedProject.siteId);
        try {
            await fetch('/api/headless-update-config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: updatedConfig }),
            });
            toast({ title: "Success", description: `Project "${selectedProject.projectName}" deleted.` });
            setHeadlessProjects(updatedConfig);
            setSelectedProject(updatedConfig.length > 0 ? updatedConfig[0] : null);
        } catch (error) {
            toast({ title: "Error Deleting Project", description: (error as Error).message, variant: "destructive" });
        }
    };

    const handleCampaignFieldChange = (id: number, field: 'key' | 'value', value: string) => setCampaignFields(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    const addCampaignField = () => setCampaignFields(prev => [...prev, { id: Date.now(), key: '', value: '' }]);
    const removeCampaignField = (id: number) => setCampaignFields(prev => prev.length > 1 ? prev.filter(f => f.id !== id) : [{ id: 1, key: '', value: '' }]);

    const handleStartJob = async () => {
        if (!selectedProject || !selectedProject.webhookUrl) {
            toast({ title: "Webhook URL Missing", variant: "destructive" }); return;
        }
        const emailList = emails.split(/[,\s\n]+/).filter(e => e.trim().includes('@'));
        if (emailList.length === 0 || !subject || !content) {
            toast({ title: "Missing Fields", description: "Emails, subject, and content are required.", variant: "destructive" }); return;
        }

        setWebhookJobs(prev => ({ ...prev, [selectedProject.siteId]: { isRunning: true, isPaused: false, processed: 0, total: emailList.length, progress: 0, results: [] } }));

        try {
            const res = await fetch('/api/headless-start-webhook-job', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookUrl: selectedProject.webhookUrl, emails: emailList, subject, content, siteId: selectedProject.siteId }),
            });
            if (!res.ok) throw new Error('Failed to start the webhook job.');
            toast({ title: "Webhook Job Started", description: `Sending to ${emailList.length} emails.` });
            setEmails(''); setSubject(''); setContent('');
        } catch (error) {
            toast({ title: "Error Starting Job", description: (error as Error).message, variant: "destructive" });
            setWebhookJobs(prev => ({ ...prev, [selectedProject.siteId]: { ...prev[selectedProject.siteId], isRunning: false } }));
        }
    };

    const handleJobControl = async (action: 'pause' | 'resume' | 'cancel') => {
        if (!selectedProject) return;
        try {
            await fetch('/api/headless-webhook-job-control', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, action }),
            });
            toast({ title: `Job ${action === 'cancel' ? 'Cancelled' : action === 'pause' ? 'Paused' : 'Resumed'}` });
        } catch (error) {
            toast({ title: "Error", description: `Failed to ${action} job.`, variant: "destructive" });
        }
    };

    const emailCount = emails.split(/[,\s\n]+/).filter(e => e.trim().includes('@')).length;
    const filteredResults = currentJob ? currentJob.results.filter(result => importFilter === 'all' || result.status === importFilter) : [];

    return (
        <div className="min-h-screen bg-gradient-subtle">
            <Navbar />
            <div className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="flex items-center gap-4">
                        <Webhook className="h-10 w-10 text-primary" />
                        <div>
                            <h1 className="text-3xl font-bold">Bulk Webhook Sender</h1>
                            <p className="text-muted-foreground">Send a custom payload to multiple emails via a Wix webhook.</p>
                        </div>
                    </div>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Select Project</CardTitle>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenDialog('edit')} disabled={!selectedProject}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={!selectedProject}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{selectedProject?.projectName}".</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteProject}>Continue</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Select value={selectedProject?.siteId} onValueChange={(siteId) => { const project = headlessProjects.find(p => p.siteId === siteId); setSelectedProject(project || null); }}>
                                <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                                <SelectContent>
                                    {headlessProjects.map(project => (<SelectItem key={project.siteId} value={project.siteId}>{project.projectName}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    <Dialog open={isProjectDialogOpen} onOpenChange={setProjectDialogOpen}>
                        <DialogContent className="sm:max-w-[625px]">
                            <DialogHeader><DialogTitle>{dialogMode === 'add' ? 'Add New Project' : 'Edit Project'}</DialogTitle></DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="projectName" className="text-right">Project Name</Label><Input id="projectName" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="col-span-3" /></div>
                                <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="siteId" className="text-right">Site ID</Label><Input id="siteId" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="col-span-3" /></div>
                                <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="apiKey" className="text-right">API Key</Label><Input id="apiKey" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="col-span-3" /></div>
                                <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="webhookUrl" className="text-right">Webhook URL</Label><Input id="webhookUrl" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="col-span-3" /></div>
                                <div className="grid grid-cols-4 items-start gap-4">
                                    <Label className="text-right pt-2">Campaigns</Label>
                                    <div className="col-span-3 space-y-2">
                                        {campaignFields.map((field) => (
                                            <div key={field.id} className="flex items-center gap-2">
                                                <Input placeholder="Campaign Name" value={field.key} onChange={(e) => handleCampaignFieldChange(field.id, 'key', e.target.value)} /><Input placeholder="Campaign ID" value={field.value} onChange={(e) => handleCampaignFieldChange(field.id, 'value', e.target.value)} /><Button variant="ghost" size="icon" onClick={() => removeCampaignField(field.id)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        ))}
                                        <Button variant="outline" size="sm" onClick={addCampaignField} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Campaign</Button>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter><Button type="button" variant="secondary" onClick={() => setProjectDialogOpen(false)}>Cancel</Button><Button type="submit" onClick={handleSaveProject}>Save Project</Button></DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div><CardTitle>Create Payload</CardTitle><CardDescription>Enter emails and content to send.</CardDescription></div>
                                <Badge variant="secondary">{emailCount} email(s)</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2"><Label htmlFor="emails">Emails</Label><Textarea id="emails" placeholder="user1@example.com, user2@example.com" className="h-24" value={emails} onChange={(e) => setEmails(e.target.value)} disabled={currentJob?.isRunning} /></div>
                            <div className="space-y-2"><Label htmlFor="subject">Subject</Label><Input id="subject" placeholder="Your test subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={currentJob?.isRunning} /></div>
                            <div className="space-y-2"><Label htmlFor="content">Content (can be HTML)</Label><Textarea id="content" placeholder="<h1>Hello!</h1><p>This is a test.</p>" className="h-32" value={content} onChange={(e) => setContent(e.target.value)} disabled={currentJob?.isRunning} /></div>
                            <Button onClick={handleStartJob} disabled={!selectedProject || currentJob?.isRunning}>
                                {currentJob?.isRunning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {currentJob?.isRunning ? 'Job Running...' : `Send to ${emailCount} Emails`}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* *** UI CHANGE: Moved this section here *** */}
                    {currentJob?.isRunning && (
                        <Card className="bg-gradient-primary text-primary-foreground shadow-glow">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xl font-bold">Job in Progress... ({currentJob.processed}/{currentJob.total})</h3>
                                    <div className="flex items-center gap-4">
                                        <Button onClick={() => handleJobControl(currentJob.isPaused ? 'resume' : 'pause')} variant="outline" className="bg-white/20 hover:bg-white/30">
                                            {currentJob.isPaused ? <PlayCircle className="mr-2 h-5 w-5" /> : <PauseCircle className="mr-2 h-5 w-5" />}
                                            {currentJob.isPaused ? 'Resume' : 'Pause'}
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild><Button variant="destructive"><StopCircle className="mr-2 h-5 w-5" /> End Job</Button></AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader><AlertDialogTitle>End the Job?</AlertDialogTitle><AlertDialogDescription>Remaining emails will not be processed.</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleJobControl('cancel')} className="bg-destructive hover:bg-destructive/90">End Job</AlertDialogAction></AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                                <Progress value={currentJob.progress} className="w-full" />
                            </CardContent>
                        </Card>
                    )}

                    {currentJob?.results && currentJob.results.length > 0 && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                            <CardHeader className="flex flex-row justify-between items-center">
                                <div><CardTitle>Import Results</CardTitle><CardDescription>The results of the bulk import process.</CardDescription></div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1"><Button variant={importFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setImportFilter('all')}>All</Button><Button variant={importFilter === 'Success' ? 'default' : 'outline'} size="sm" onClick={() => setImportFilter('Success')}>Success</Button><Button variant={importFilter === 'Failed' ? 'default' : 'outline'} size="sm" onClick={() => setImportFilter('Failed')}>Failed</Button></div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {filteredResults.map((result, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-mono text-xs">{result.email}</TableCell>
                                                <TableCell>{result.status === 'Success' ? (<span className="flex items-center gap-2 text-green-500"><CheckCircle className="h-4 w-4" /> Success</span>) : (<span className="flex items-center gap-2 text-red-500"><XCircle className="h-4 w-4" /> Failed</span>)}</TableCell>
                                                <TableCell>{result.reason}</TableCell>
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

export default WebhookTestPage;