import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { HeadlessImportPage } from './headless/pages/HeadlessImportPage';
import CampaignStatsPage, { CampaignStatsState } from './headless/pages/CampaignStatsPage';
import { jobManager, JobState, UpdatePayload } from './headless/lib/JobManager';

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

// ★★★ NEW: Define the shape of the deletion job state ★★★
export interface DeleteJobState {
    isDeleteJobRunning: boolean;
    deleteProgress: { processed: number; total: number };
}

const App = () => {
    // State for the Import page jobs
    const [jobs, setJobs] = useState<Record<string, JobState>>({});
    // State for the Campaign Statistics page
    const [campaignStats, setCampaignStats] = useState<CampaignStatsState>(initialCampaignStatsState);
    // ★★★ NEW: State for the Deletion job progress ★★★
    const [deleteJobState, setDeleteJobState] = useState<DeleteJobState>({
        isDeleteJobRunning: false,
        deleteProgress: { processed: 0, total: 0 },
    });


    useEffect(() => {
        const handleJobUpdate = (data: UpdatePayload) => {
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

    // ★★★ NEW: Handler to update the Deletion job state ★★★
    const handleDeleteJobStateChange = (updates: Partial<DeleteJobState>) => {
        setDeleteJobState(prev => ({ ...prev, ...updates }));
    };

    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Index />} />
                        {/* ★★★ UPDATE: Pass the delete job state and handler down ★★★ */}
                        <Route
                            path="/headless-import"
                            element={<HeadlessImportPage 
                                jobs={jobs} 
                                onJobStateChange={handleJobStateChange}
                                deleteJobState={deleteJobState}
                                onDeleteJobStateChange={handleDeleteJobStateChange}
                            />}
                        />
                        <Route
                            path="/campaign-stats"
                            element={<CampaignStatsPage statsState={campaignStats} onStatsStateChange={handleCampaignStatsChange} />}
                        />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </BrowserRouter>
            </TooltipProvider>
        </QueryClientProvider>
    );
};

export default App;