import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Webhook, Send, RefreshCw } from "lucide-react";
import Navbar from '@/components/Navbar';
import { useToast } from "@/hooks/use-toast";

const WebhookTestPage = () => {
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [response, setResponse] = useState('');
    const { toast } = useToast();

    const handleSubmit = async () => {
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
                            <Button onClick={handleSubmit} disabled={isSending}>
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
