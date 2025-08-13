import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { HeadlessImportPage } from './headless/pages/HeadlessImportPage';
import CampaignStatsPage, { CampaignStatsState } from './headless/pages/CampaignStatsPage';
import BulkDeletePage from './headless/pages/BulkDeletePage';
import WebhookTestPage from "./pages/WebhookTestPage";
import { jobManager, JobState } from './headless/lib/JobManager';

// Define the project structure here to be shared across components
export interface HeadlessProject {
    projectName: string;
    siteId: string;
    apiKey: string;
    campaigns?: { [key: string]: string; };
    webhookUrl?: string;
}

const queryClient = new QueryClient();

const initialJobState: JobState = {
    siteId: '', emails: '', results: [], isLoading: false, isPaused: false,
    progress: 0, countdown: 0, delaySeconds: 1, totalEmails: 0,
    processedEmails: 0, jobCancelled: false,
};

const initialCampaignStatsState: CampaignStatsState = {
    selectedProject: null, selectedCampaignId: '', selectedActivity: '',
    recipients: [], summaryStats: null,
};

const App = () => {
    const { toast } = useToast();
    const [jobs, setJobs] = useState<Record<string, JobState>>({});
    const [campaignStats, setCampaignStats] = useState<CampaignStatsState>(initialCampaignStatsState);
    
    // State for projects is now managed here in the main App component
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);

    // Fetch the projects when the application first loads
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const response = await fetch('/api/headless-get-config');
                if (response.ok) {
                    const projects = await response.json();
                    setHeadlessProjects(projects);
                    // If no project is selected yet, select the first one
                    if (projects.length > 0 && !selectedProject) {
                        setSelectedProject(projects[0]);
                    }
                }
            } catch (error) {
                toast({ title: "Error", description: "Could not load projects.", variant: "destructive" });
            }
        };
        fetchProjects();
    }, []); // The empty array means this effect runs only once

    useEffect(() => {
        const handleJobUpdate = (data: any) => {
            setJobs(prev => ({
                ...prev,
                [data.siteId]: { ...(prev[data.siteId] || initialJobState), ...data.payload }
            }));
        };
        const initialState = jobManager.getJobsState();
        setJobs(initialState);
        jobManager.subscribe(handleJobUpdate);
        return () => { jobManager.unsubscribe(); };
    }, []);

    const handleJobStateChange = (siteId: string, updates: Partial<JobState>) => {
        setJobs(prev => ({
            ...prev,
            [siteId]: { ...(prev[siteId] || initialJobState), ...updates }
        }));
    };
    
    const handleCampaignStatsChange = (updates: Partial<CampaignStatsState>) => {
        setCampaignStats(prev => ({ ...prev, ...updates }));
    };

    // Props to pass down to the pages that need project management
    const projectManagerProps = {
        headlessProjects,
        selectedProject,
        setHeadlessProjects,
        setSelectedProject,
    };

    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Index />} />
                        <Route
                            path="/headless-import"
                            element={<HeadlessImportPage 
                                jobs={jobs} 
                                onJobStateChange={handleJobStateChange}
                                {...projectManagerProps}
                            />}
                        />
                        <Route
                            path="/campaign-stats"
                            element={<CampaignStatsPage 
                                statsState={campaignStats} 
                                onStatsStateChange={handleCampaignStatsChange} 
                            />}
                        />
                        <Route
                            path="/bulk-delete"
                            element={<BulkDeletePage {...projectManagerProps} />}
                        />
                        <Route path="/webhook-test" element={<WebhookTestPage {...projectManagerProps} />} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </BrowserRouter>
            </TooltipProvider>
        </QueryClientProvider>
    );
};

export default App;
