import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Webhook, Send, RefreshCw } from "lucide-react";
import Navbar from '@/components/Navbar';
import { useToast } from "@/hooks/use-toast";

// *** ADDED: Project interface to match the main config ***
interface HeadlessProject {
    projectName: string;
    siteId: string;
    webhookUrl?: string;
}

const WebhookTestPage = () => {
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [response, setResponse] = useState('');
    const { toast } = useToast();

    // *** ADDED: Fetch projects to populate the dropdown ***
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


    const handleSubmit = async () => {
        if (!selectedProject || !selectedProject.webhookUrl) {
            toast({
                title: "Webhook URL Missing",
                description: "The selected project does not have a webhook URL configured. Please edit the project to add one.",
                variant: "destructive",
            });
            return;
        }

        if (!email || !subject || !content) {
            toast({
                title: "Missing Fields",
                description: "Please fill out all the fields before submitting.",
                variant: "destructive",
            });
            return;
        }

        setIsSending(true);
        setResponse('');

        try {
            const res = await fetch('/api/headless-send-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    webhookUrl: selectedProject.webhookUrl, // *** UPDATED: Send the selected URL to the backend ***
                    email_field: email,
                    subject_field: subject,
                    content_field: content,
                }),
            });

            const responseData = await res.text();
            
            if (!res.ok) {
                throw new Error(`Webhook failed with status ${res.status}: ${responseData}`);
            }
            
            setResponse(`Status: ${res.status}\nResponse Body:\n${responseData}`);
            toast({
                title: "Webhook Sent!",
                description: "Your data was successfully sent to the Wix webhook.",
            });
            // Clear the form
            setEmail('');
            setSubject('');
            setContent('');

        } catch (error) {
            const errorMessage = (error as Error).message;
            setResponse(`Error:\n${errorMessage}`);
            toast({
                title: "Error Sending Webhook",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-subtle">
            <Navbar />
            <div className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="flex items-center gap-4">
                        <Webhook className="h-10 w-10 text-primary" />
                        <div>
                            <h1 className="text-3xl font-bold">Webhook Tester</h1>
                            <p className="text-muted-foreground">Send a test payload to your Wix webhook endpoint.</p>
                        </div>
                    </div>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader>
                            <CardTitle>Send Data</CardTitle>
                            <CardDescription>Fill in the details below to send a test request.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* *** ADDED: Project selector dropdown *** */}
                            <div className="space-y-2">
                                <Label htmlFor="project">Select Project</Label>
                                <Select 
                                    value={selectedProject?.siteId} 
                                    onValueChange={(siteId) => {
                                        const project = headlessProjects.find(p => p.siteId === siteId) || null;
                                        setSelectedProject(project);
                                    }}
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
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subject">Subject</Label>
                                <Input id="subject" placeholder="Your test subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="content">Content</Label>
                                <Textarea id="content" placeholder="Type your message here." className="h-32" value={content} onChange={(e) => setContent(e.target.value)} />
                            </div>
                            <Button onClick={handleSubmit} disabled={isSending || !selectedProject}>
                                {isSending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {isSending ? 'Sending...' : 'Send to Webhook'}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        <CardHeader>
                            <CardTitle>Webhook Response</CardTitle>
                            <CardDescription>The response from the Wix server will appear here.</CardDescription>
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
