// Define the shape of a single import result
export interface Result {
    email: string;
    status: 'Success' | 'Failed';
    message: string;
    fullResponse: object;
}

// Define the state for a single import job
export interface JobState {
    siteId: string;
    emails: string;
    results: Result[];
    isLoading: boolean;
    isPaused: boolean;
    progress: number;
    countdown: number;
    delaySeconds: number;
    totalEmails: number;
    processedEmails: number;
    jobCancelled: boolean;
}

// Define the payload for updates sent back to the UI
export type UpdatePayload = {
    type: 'START' | 'PROGRESS' | 'RESULT' | 'DONE' | 'COUNTDOWN';
    siteId: string;
    payload: Partial<JobState>;
};

// The main JobManager class (no longer exported directly)
class JobManager {
    private jobs: Map<string, JobState> = new Map();
    // The callback is now a class property, can be null
    private onUpdate: ((data: UpdatePayload) => void) | null = null;

    // --- NEW: A method for the UI to subscribe to updates ---
    public subscribe(callback: (data: UpdatePayload) => void) {
        this.onUpdate = callback;
    }
    
    // --- NEW: A method for the UI to unsubscribe ---
    public unsubscribe() {
        this.onUpdate = null;
    }

    // --- NEW: A method for the UI to get the current state of all jobs ---
    public getJobsState(): Record<string, JobState> {
        return Object.fromEntries(this.jobs.entries());
    }

    // Public method to start a new job
    public startJob(siteId: string, emails: string, delaySeconds: number): void {
        // Prevent starting a job if one is already running for the same site
        if (this.jobs.get(siteId)?.isLoading) {
            return;
        }

        const emailList = emails.split(/[,\s\n]+/).filter(e => e.trim().includes('@'));
        const totalEmails = emailList.length;

        const newJob: JobState = {
            siteId,
            emails,
            delaySeconds,
            totalEmails,
            results: [],
            isLoading: true,
            isPaused: false,
            jobCancelled: false,
            progress: 0,
            countdown: 0,
            processedEmails: 0,
        };

        this.jobs.set(siteId, newJob);

        if (this.onUpdate) {
            this.onUpdate({
                type: 'START',
                siteId,
                payload: {
                    isLoading: true,
                    isPaused: false,
                    jobCancelled: false,
                    results: [],
                    progress: 0,
                    processedEmails: 0,
                    totalEmails: totalEmails
                }
            });
        }
        
        this._runJob(siteId, emailList);
    }

    // Public method to pause a job
    public pauseJob(siteId: string): void {
        const job = this.jobs.get(siteId);
        if (job && job.isLoading) {
            job.isPaused = true;
            if (this.onUpdate) {
                this.onUpdate({ type: 'PROGRESS', siteId, payload: { isPaused: true } });
            }
        }
    }

    // Public method to resume a job
    public resumeJob(siteId: string): void {
        const job = this.jobs.get(siteId);
        if (job && job.isLoading) {
            job.isPaused = false;
            if (this.onUpdate) {
                this.onUpdate({ type: 'PROGRESS', siteId, payload: { isPaused: false } });
            }
        }
    }

    // Public method to cancel a job
    public cancelJob(siteId: string): void {
        const job = this.jobs.get(siteId);
        if (job && job.isLoading) {
            job.jobCancelled = true;
        }
    }

    // The private "engine" that runs the import loop
    private async _runJob(siteId: string, emailList: string[]): Promise<void> {
        const job = this.jobs.get(siteId);
        if (!job) return;

        let currentIndex = 0;
        while (currentIndex < job.totalEmails) {
            
            if (job.jobCancelled) {
                if (this.onUpdate) this.onUpdate({ type: 'DONE', siteId, payload: { isLoading: false, isPaused: false } });
                break;
            }

            if (job.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            if (currentIndex > 0 && job.delaySeconds > 0) {
                for (let i = job.delaySeconds; i > 0; i--) {
                    if (job.jobCancelled || job.isPaused) break;
                    if (this.onUpdate) this.onUpdate({ type: 'COUNTDOWN', siteId, payload: { countdown: i } });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                if (this.onUpdate) this.onUpdate({ type: 'COUNTDOWN', siteId, payload: { countdown: 0 } });
                 if (job.jobCancelled || job.isPaused) continue;
            }
            
            const email = emailList[currentIndex];
            const requestBody = { email, siteId };

            try {
                const response = await fetch('/api/headless-register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
                const responseData = await response.json();

                const newResult: Result = {
                    email,
                    status: (response.ok && (responseData.state === 'SUCCESS' || responseData.state === 'REQUIRE_EMAIL_VERIFICATION')) ? 'Success' : 'Failed',
                    message: (response.ok && (responseData.state === 'SUCCESS' || responseData.state === 'REQUIRE_EMAIL_VERIFICATION')) ? 
                             (responseData.state === 'SUCCESS' ? 'Member registered instantly.' : 'Success (Email verification sent).') : 
                             (responseData.message || 'Registration failed.'),
                    fullResponse: responseData,
                };
                job.results.push(newResult);

            } catch (error) {
                 const errorResponse = { error: 'Network error or issue with local server.', details: (error as Error).toString() };
                 const newResult: Result = { email, status: 'Failed', message: 'Network error connecting to local server.', fullResponse: errorResponse };
                 job.results.push(newResult);
            }

            job.processedEmails = currentIndex + 1;
            job.progress = (job.processedEmails / job.totalEmails) * 100;
            
            if (this.onUpdate) {
                this.onUpdate({
                    type: 'PROGRESS',
                    siteId,
                    payload: {
                        results: job.results,
                        progress: job.progress,
                        processedEmails: job.processedEmails
                    }
                });
            }

            currentIndex++;
        }

        if (this.jobs.has(siteId)) {
            const finalJob = this.jobs.get(siteId)!;
            finalJob.isLoading = false;
            finalJob.isPaused = false;
            if (this.onUpdate) this.onUpdate({ type: 'DONE', siteId, payload: { isLoading: false, isPaused: false, progress: 100 } });
        }
    }
}

// --- KEY CHANGE: Create and export a single, global instance of the manager ---
export const jobManager = new JobManager();