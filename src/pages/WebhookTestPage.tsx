import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Webhook, Send, RefreshCw, PlusCircle, Pencil, Trash2 } from "lucide-react";
import Navbar from '@/components/Navbar';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { HeadlessProject } from '@/App'; // Import the shared interface from App.tsx
import { Badge } from "@/components/ui/badge";

// Interface for campaign fields in the dialog
type CampaignField = { id: number; key: string; value: string; };

// Props for the page, passed down from App.tsx
interface WebhookTestPageProps {
    headlessProjects: HeadlessProject[];
    selectedProject: HeadlessProject | null;
    setHeadlessProjects: (projects: HeadlessProject[]) => void;
    setSelectedProject: (project: HeadlessProject | null) => void;
}

const WebhookTestPage = ({
    headlessProjects,
    selectedProject,
    setHeadlessProjects,
    setSelectedProject
}: WebhookTestPageProps) => {
    const { toast } = useToast();
    
    // State for the webhook form itself
    const [emails, setEmails] = useState('');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [response, setResponse] = useState('');
    
    // --- Project Management State (copied from HeadlessImportPage) ---
    const [isProjectDialogOpen, setProjectDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [projectName, setProjectName] = useState("");
    const [siteId, setSiteId] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [originalSiteId, setOriginalSiteId] = useState("");
    const [campaignFields, setCampaignFields] = useState<CampaignField[]>([{ id: 1, key: '', value: '' }]);

    // --- Project Management Logic (copied from HeadlessImportPage) ---
    const handleOpenDialog = (mode: 'add' | 'edit') => {
        setDialogMode(mode);
        if (mode === 'edit' && selectedProject) {
            setProjectName(selectedProject.projectName);
            setSiteId(selectedProject.siteId);
            setOriginalSiteId(selectedProject.siteId);
            setApiKey(selectedProject.apiKey);
            setWebhookUrl(selectedProject.webhookUrl || "");
            const campaignsArray = selectedProject.campaigns ? 
                Object.entries(selectedProject.campaigns).map(([key, value], index) => ({ id: index, key, value })) 
                : [];
            setCampaignFields(campaignsArray.length > 0 ? campaignsArray : [{ id: 0, key: '', value: '' }]);
        } else {
            setProjectName(""); setSiteId(""); setApiKey(""); setWebhookUrl("");
            setCampaignFields([{ id: 0, key: '', value: '' }]);
            setOriginalSiteId("");
        }
        setProjectDialogOpen(true);
    };

    const handleSaveProject = async () => {
        if (!projectName || !siteId || !apiKey) {
            toast({ title: "Missing Fields", description: "Please fill out Project Name, Site ID, and API Key.", variant: "destructive" });
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
                toast({ title: "Duplicate Site ID", description: "A project with this Site ID already exists.", variant: "destructive" });
                return;
            }
            updatedConfig = [...headlessProjects, projectData];
        }
        try {
            const updateResponse = await fetch('/api/headless-update-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: updatedConfig }),
            });
            if (!updateResponse.ok) throw new Error('Failed to save the project configuration.');
            toast({ title: "Success", description: `Project "${projectName}" saved successfully.` });
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
            const updateResponse = await fetch('/api/headless-update-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: updatedConfig }),
            });
            if (!updateResponse.ok) throw new Error('Failed to save the updated project configuration.');
            toast({ title: "Success", description: `Project "${selectedProject.projectName}" has been deleted.` });
            setHeadlessProjects(updatedConfig);
            setSelectedProject(updatedConfig.length > 0 ? updatedConfig[0] : null);
        } catch (error) {
            toast({ title: "Error Deleting Project", description: (error as Error).message, variant: "destructive" });
        }
    };
    
    const handleCampaignFieldChange = (id: number, field: 'key' | 'value', value: string) => {
        setCampaignFields(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    };
    const addCampaignField = () => setCampaignFields(prev => [...prev, { id: Date.now(), key: '', value: '' }]);
    const removeCampaignField = (id: number) => {
        setCampaignFields(prev => prev.length > 1 ? prev.filter(f => f.id !== id) : [{ id: 1, key: '', value: '' }]);
    };
    // --- End of Copied Logic ---

    // Webhook submission logic
    const handleSubmit = async () => {
        if (!selectedProject || !selectedProject.webhookUrl) {
            toast({ title: "Webhook URL Missing", description: "Please edit the selected project to add a webhook URL.", variant: "destructive" });
            return;
        }
        const emailList = emails.split(/[,\s\n]+/).filter(e => e.trim().includes('@'));
        if (emailList.length === 0 || !subject || !content) {
            toast({ title: "Missing Fields", description: "Please provide at least one email, a subject, and content.", variant: "destructive" });
            return;
        }
        setIsSending(true);
        setResponse('');
        try {
            const res = await fetch('/api/headless-send-bulk-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    webhookUrl: selectedProject.webhookUrl, 
                    emails: emailList, 
                    subject, 
                    content 
                }),
            });
            const responseData = await res.json();
            if (!res.ok) throw new Error(`Webhook failed: ${responseData.message || 'Unknown error'}`);
            
            setResponse(`Successfully sent to ${responseData.successCount} emails.\nFailed to send to ${responseData.failureCount} emails.\n\nSee console for detailed logs.`);
            console.log("Webhook Results:", responseData.results);
            toast({ title: "Webhook Batch Sent!", description: `Processed ${emailList.length} emails.` });
            setEmails(''); setSubject(''); setContent('');
        } catch (error) {
            const errorMessage = (error as Error).message;
            setResponse(`Error:\n${errorMessage}`);
            toast({ title: "Error Sending Webhooks", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSending(false);
        }
    };

    const emailCount = emails.split(/[,\s\n]+/).filter(e => e.trim().includes('@')).length;

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

                    {/* --- Copied Project Management JSX --- */}
                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Select Project</CardTitle>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenDialog('edit')} disabled={!selectedProject}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" disabled={!selectedProject}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>This will permanently delete "{selectedProject?.projectName}".</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDeleteProject}>Continue</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Select value={selectedProject?.siteId} onValueChange={(siteId) => { const project = headlessProjects.find(p => p.siteId === siteId); setSelectedProject(project || null); }}>
                                <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                                <SelectContent>
                                    {headlessProjects.map(project => (
                                        <SelectItem key={project.siteId} value={project.siteId}>{project.projectName}</SelectItem>
                                    ))}
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
                                                <Input placeholder="Campaign Name" value={field.key} onChange={(e) => handleCampaignFieldChange(field.id, 'key', e.target.value)} />
                                                <Input placeholder="Campaign ID" value={field.value} onChange={(e) => handleCampaignFieldChange(field.id, 'value', e.target.value)} />
                                                <Button variant="ghost" size="icon" onClick={() => removeCampaignField(field.id)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        ))}
                                        <Button variant="outline" size="sm" onClick={addCampaignField} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Campaign</Button>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter><Button type="button" variant="secondary" onClick={() => setProjectDialogOpen(false)}>Cancel</Button><Button type="submit" onClick={handleSaveProject}>Save Project</Button></DialogFooter>
                        </DialogContent>
                    </Dialog>
                    {/* --- End of Copied JSX --- */}

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Create Payload</CardTitle>
                                    <CardDescription>Enter the emails and content to send.</CardDescription>
                                </div>
                                <Badge variant="secondary">{emailCount} email(s)</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="emails">Emails</Label>
                                <Textarea id="emails" placeholder="user1@example.com, user2@example.com" className="h-24" value={emails} onChange={(e) => setEmails(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subject">Subject</Label>
                                <Input id="subject" placeholder="Your test subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="content">Content (can be HTML)</Label>
                                <Textarea id="content" placeholder="<h1>Hello!</h1><p>This is a test.</p>" className="h-32" value={content} onChange={(e) => setContent(e.target.value)} />
                            </div>
                            <Button onClick={handleSubmit} disabled={isSending || !selectedProject}>
                                {isSending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {isSending ? `Sending... (${emailCount})` : `Send to ${emailCount} Emails`}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader>
                            <CardTitle>Webhook Response</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <pre className="w-full rounded-md bg-muted p-4 text-sm text-muted-foreground overflow-x-auto">
                                <code>{response || 'Awaiting submission...'}</code>
                            </pre>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default WebhookTestPage;
