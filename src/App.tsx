import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { HeadlessImportPage } from './headless/pages/HeadlessImportPage';
import CampaignStatsPage from './headless/pages/CampaignStatsPage'; 
import { jobManager, JobState, UpdatePayload } from './headless/lib/JobManager';

const queryClient = new QueryClient();

// Define a simple initial state for jobs
const initialJobState: JobState = {
    siteId: '',
    emails: '',
    results: [],
    isLoading: false,
    isPaused: false,
    progress: 0,
    countdown: 0,
    delaySeconds: 1,
    totalEmails: 0,
    processedEmails: 0,
    jobCancelled: false,
};

const App = () => {
  // ★★★ NEW: The state for all jobs now lives here in the main App component ★★★
  const [jobs, setJobs] = useState<Record<string, JobState>>({});

  // ★★★ NEW: This effect subscribes to the job manager and keeps the state updated ★★★
  useEffect(() => {
    const handleJobUpdate = (data: UpdatePayload) => {
      setJobs(prev => ({
          ...prev,
          [data.siteId]: {
              ...(prev[data.siteId] || initialJobState),
              ...data.payload,
          }
      }));
    };
    
    const initialState = jobManager.getJobsState();
    setJobs(initialState);
    jobManager.subscribe(handleJobUpdate);
    
    return () => {
      jobManager.unsubscribe();
    };
  }, []);

  // ★★★ NEW: This function is passed down to the pages to allow them to update the job state ★★★
  const handleJobStateChange = (siteId: string, updates: Partial<JobState>) => {
    setJobs(prev => ({
        ...prev,
        [siteId]: {
            ...(prev[siteId] || initialJobState),
            ...updates,
        }
    }));
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* ★★★ UPDATE: Pass the jobs state and handler down to the HeadlessImportPage ★★★ */}
            <Route 
              path="/headless-import" 
              element={<HeadlessImportPage jobs={jobs} onJobStateChange={handleJobStateChange} />} 
            />
            <Route path="/campaign-stats" element={<CampaignStatsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;