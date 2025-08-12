import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Server, PlayCircle, CheckCircle, XCircle, FileJson, Trash2, Search, RefreshCw, Save, PlusCircle, BarChart2, Users, MailCheck, MailX, MousePointerClick, Pencil, Download, ListChecks, Link, Link2, AlertCircle, MailMinus, Send, PauseCircle, StopCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Navbar from '@/components/Navbar';
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Progress } from '@/components/ui/progress';
import { jobManager, JobState, UpdatePayload } from '../lib/JobManager';

const exportEmailsToTxt = (data: any[], filename: string) => {
    const emailKeys = ['email', 'loginEmail', 'emailAddress'];
    const emails = data.map(row => { for (const key of emailKeys) { if (row[key]) return row[key]; } return null; }).filter(email => email);
    if (emails.length === 0) { alert("No emails to export."); return; }
    const txtContent = emails.join('\n');
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.txt`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

interface Campaign { [key: string]: string; }
interface HeadlessProject { projectName: string; siteId: string; apiKey: string; campaigns?: Campaign; }
interface Member { id: string; loginEmail: string; contactId: string; profile: { nickname: string; }; status?: string; }
interface SenderDetails { fromName: string; fromEmail: string; }
interface CampaignStatistics {
    delivered: CampaignRecipient[];
    opened: CampaignRecipient[];
    clicked: CampaignRecipient[];
    bounced: CampaignRecipient[];
    notSent: CampaignRecipient[];
    complained: number;
}
interface CampaignRecipient { contactId: string; lastActivityDate: string; emailAddress?: string; fullName?: string; }
type CampaignField = { id: number; key: string; value: string; };

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

export function HeadlessImportPage() {
    // --- State Variables ---
    const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<HeadlessProject | undefined>();
    const [jobs, setJobs] = useState<Record<string, JobState>>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Member[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();
    const [senderDetails, setSenderDetails] = useState<SenderDetails | null>(null);
    const [isFetchingSender, setIsFetchingSender] = useState(false);
    const [isUpdatingSender, setIsUpdatingSender] = useState(false);
    const [isProjectDialogOpen, setProjectDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [projectName, setProjectName] = useState("");
    const [siteId, setSiteId] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [originalSiteId, setOriginalSiteId] = useState("");
    const [campaignFields, setCampaignFields] = useState<CampaignField[]>([{ id: 1, key: '', value: '' }]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [statistics, setStatistics] = useState<CampaignStatistics | null>(null);
    const [isFetchingStats, setIsFetchingStats] = useState(false);
    const [recipientDialogData, setRecipientDialogData] = useState<{title: string, recipients: CampaignRecipient[]}>({title: '', recipients: []});
    const [isAllMembersDialogOpen, setAllMembersDialogOpen] = useState(false);
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [isFetchingAllMembers, setIsFetchingAllMembers] = useState(false);
    const [selectedAllMembers, setSelectedAllMembers] = useState<string[]>([]);
    const [filterQuery, setFilterQuery] = useState("");
    const [allMembersFilterQuery, setAllMembersFilterQuery] = useState("");
    const [importFilter, setImportFilter] = useState<'all' | 'Success' | 'Failed'>('all');
    const [isLinkValidatorOpen, setLinkValidatorOpen] = useState(false);
    const [htmlToValidate, setHtmlToValidate] = useState('');
    const [validationResults, setValidationResults] = useState<string[]>([]);
    const [isLinkValidating, setIsLinkValidating] = useState(false);
    const [isUrlValidatorOpen, setUrlValidatorOpen] = useState(false);
    const [urlToValidate, setUrlToValidate] = useState('');
    const [urlValidationResult, setUrlValidationResult] = useState<string | null>(null);
    const [isUrlValidating, setIsUrlValidating] = useState(false);
    const [isTestEmailOpen, setTestEmailOpen] = useState(false);
    const [testEmailAddress, setTestEmailAddress] = useState('');
    const [testEmailSubject, setTestEmailSubject] = useState('This is a test email');
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [testEmailResponse, setTestEmailResponse] = useState('');
    
    // --- State for the deletion progress ---
    const [isDeletingAll, setIsDeletingAll] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState({ processed: 0, total: 0 });
    const [isDeleteJobRunning, setIsDeleteJobRunning] = useState(false);
    
    // --- Effect to fetch projects on initial load ---
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
                } else {
                    setHeadlessProjects([]);
                }
            } catch (error) {
                console.error("Failed to fetch projects:", error);
                setHeadlessProjects([]);
                toast({ title: "Error", description: "Could not load project list.", variant: "destructive" });
            }
        };
        fetchProjects();
    }, []);

    // --- Effect for Job Manager (for imports) ---
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
    
    // --- Effect to check for an already running DELETE job when a project is selected ---
    useEffect(() => {
        const checkForRunningJob = async () => {
            if (selectedProject) {
                try {
                    const response = await fetch('/api/headless-job-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ siteId: selectedProject.siteId }),
                    });
                    const data = await response.json();
                    if (data.status === 'running') {
                        setDeleteProgress({ processed: data.processed, total: data.total });
                        setIsDeleteJobRunning(true);
                    }
                } catch (error) {
                    console.error("Error checking for initial job status:", error);
                }
            }
        };
        checkForRunningJob();
    }, [selectedProject]);

    // --- Effect to poll for DELETE job progress updates ---
    useEffect(() => {
        if (isDeleteJobRunning && selectedProject) {
            const intervalId = setInterval(async () => {
                try {
                    const response = await fetch('/api/headless-job-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ siteId: selectedProject.siteId }),
                    });
                    const data = await response.json();

                    if (data.status === 'running') {
                        setDeleteProgress({ processed: data.processed, total: data.total });
                    } else if (data.status === 'complete' || data.status === 'idle') {
                        setIsDeleteJobRunning(false);
                        setDeleteProgress({ processed: data.total, total: data.total });
                        toast({ title: "Deletion Complete", description: "All selected members have been deleted." });
                        handleListAllMembers();
                    }
                } catch (error) {
                    console.error("Failed to fetch delete job status:", error);
                    setIsDeleteJobRunning(false);
                }
            }, 2000);

            return () => clearInterval(intervalId);
        }
    }, [isDeleteJobRunning, selectedProject, toast]);

    const currentJob = selectedProject ? jobs[selectedProject.siteId] : undefined;

    const filteredSearchResults = searchResults.filter(member =>
      member.profile?.nickname?.toLowerCase().includes(filterQuery.toLowerCase()) ||
      member.loginEmail.toLowerCase().includes(filterQuery.toLowerCase())
    );
  
    const filteredAllMembers = allMembers.filter(member =>
      member.profile?.nickname?.toLowerCase().includes(allMembersFilterQuery.toLowerCase()) ||
      member.loginEmail.toLowerCase().includes(allMembersFilterQuery.toLowerCase())
    );
    
    const filteredImportResults = currentJob ? currentJob.results.filter(result => {
      if (importFilter === 'all') return true;
      return result.status === importFilter;
    }) : [];
    
    const handleJobStateChange = (siteId: string, updates: Partial<JobState>) => {
      setJobs(prev => ({
          ...prev,
          [siteId]: {
              ...(prev[siteId] || initialJobState),
              ...updates,
          }
      }));
    };
  
    const fetchSenderDetails = async (siteId: string) => {
      if (!siteId) return;
      setIsFetchingSender(true);
      setSenderDetails(null);
      try {
          const response = await fetch('/api/headless-sender-details', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ siteId }),
          });
          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.message || 'Failed to fetch sender details.');
          }
          const data = await response.json();
          setSenderDetails(data.senderDetails);
      } catch (error: any) {
          toast({ title: "Error fetching sender details", description: error.message, variant: "destructive" });
      } finally {
          setIsFetchingSender(false);
      }
    };
  
    const handleUpdateSenderName = async () => {
      if (!senderDetails || !selectedProject) return;
      setIsUpdatingSender(true);
      try {
          const response = await fetch('/api/headless-sender-details', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  siteId: selectedProject.siteId,
                  senderDetails: {
                      fromName: senderDetails.fromName,
                      fromEmail: senderDetails.fromEmail
                  }
              }),
          });
          if (!response.ok) {
               const err = await response.json();
              throw new Error(err.message || 'Failed to update sender name.');
          }
          const data = await response.json();
          toast({ title: "Success", description: data.verificationNeeded ? "Sender name updated. Verification may be needed." : "Sender name updated successfully." });
      } catch (error: any) {
          toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      } finally {
          setIsUpdatingSender(false);
      }
    };
  
    const handleOpenDialog = (mode: 'add' | 'edit') => {
      setDialogMode(mode);
      if (mode === 'edit' && selectedProject) {
        setProjectName(selectedProject.projectName);
        setSiteId(selectedProject.siteId);
        setOriginalSiteId(selectedProject.siteId);
        setApiKey(selectedProject.apiKey);
        const campaignsArray = selectedProject.campaigns ? 
          Object.entries(selectedProject.campaigns).map(([key, value], index) => ({ id: index, key, value })) 
          : [];
        setCampaignFields(campaignsArray.length > 0 ? campaignsArray : [{ id: 0, key: '', value: '' }]);
      } else {
        setProjectName("");
        setSiteId("");
        setApiKey("");
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
            if (field.key && field.value) {
                acc[field.key] = field.value;
            }
            return acc;
        }, {} as Campaign);
    
        const projectData: HeadlessProject = {
            projectName,
            siteId,
            apiKey,
            campaigns: campaignsObject
        };
    
        try {
            let currentConfig: HeadlessProject[] = [];
            try {
                const response = await fetch('/api/headless-get-config');
                if (response.ok) {
                    currentConfig = await response.json();
                }
            } catch (e) {
                console.error("Could not fetch initial config, starting with an empty list.", e);
            }
    
            let updatedConfig: HeadlessProject[];
    
            if (dialogMode === 'edit') {
                updatedConfig = currentConfig.map(p => (p.siteId === originalSiteId ? projectData : p));
            } else {
                if (currentConfig.some(p => p.siteId === siteId)) {
                    toast({ title: "Duplicate Site ID", description: "A project with this Site ID already exists.", variant: "destructive" });
                    return;
                }
                updatedConfig = [...currentConfig, projectData];
            }
    
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
        if (!selectedProject) {
            toast({ title: "No Project Selected", description: "Please select a project to delete.", variant: "destructive" });
            return;
        }

        try {
            const updatedConfig = headlessProjects.filter(p => p.siteId !== selectedProject.siteId);

            const updateResponse = await fetch('/api/headless-update-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: updatedConfig }),
            });

            if (!updateResponse.ok) {
                throw new Error('Failed to save the updated project configuration.');
            }

            toast({ title: "Success", description: `Project "${selectedProject.projectName}" has been deleted.` });

            setHeadlessProjects(updatedConfig);
            setSelectedProject(updatedConfig.length > 0 ? updatedConfig[0] : undefined);

        } catch (error) {
            toast({ title: "Error Deleting Project", description: (error as Error).message, variant: "destructive" });
        }
    };

    const handleCampaignFieldChange = (id: number, field: 'key' | 'value', value: string) => {
        setCampaignFields(prevFields =>
            prevFields.map(f => f.id === id ? { ...f, [field]: value } : f)
        );
    };

    const addCampaignField = () => {
        setCampaignFields(prev => [...prev, { id: Date.now(), key: '', value: '' }]);
    };

    const removeCampaignField = (id: number) => {
        if (campaignFields.length > 1) {
            setCampaignFields(prev => prev.filter(f => f.id !== id));
        } else {
            setCampaignFields([{ id: 1, key: '', value: '' }]);
        }
    };

    const fetchRecipientsForActivity = async (activity: string, campaignId: string, siteId: string): Promise<CampaignRecipient[]> => {
        const response = await fetch('/api/headless-get-recipients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId, campaignId, activity }),
        });
        if (!response.ok) throw new Error(`Failed to fetch ${activity.toLowerCase()} recipients.`);
        const data = await response.json();
        return (data.recipients || []).filter((r: CampaignRecipient) => r.emailAddress);
    };

    const handleFetchStats = async (campaignId: string) => {
        if (!campaignId || !selectedProject) {
            setStatistics(null);
            return;
        }
        setIsFetchingStats(true);
        setStatistics(null);
        try {
            const summaryResponse = await fetch('/api/headless-get-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, campaignIds: [campaignId] }),
            });
            if (!summaryResponse.ok) throw new Error('Failed to fetch campaign summary.');
            const summaryData = await summaryResponse.json();
            const summaryEmailStats = summaryData.statistics && summaryData.statistics.length > 0 ? summaryData.statistics[0].email : null;

            const [delivered, opened, clicked, bounced, notSent] = await Promise.all([
                fetchRecipientsForActivity('DELIVERED', campaignId, selectedProject.siteId),
                fetchRecipientsForActivity('OPENED', campaignId, selectedProject.siteId),
                fetchRecipientsForActivity('CLICKED', campaignId, selectedProject.siteId),
                fetchRecipientsForActivity('BOUNCED', campaignId, selectedProject.siteId),
                fetchRecipientsForActivity('NOT_SENT', campaignId, selectedProject.siteId),
            ]);
            
            setStatistics({ 
                delivered, 
                opened, 
                clicked, 
                bounced, 
                notSent, 
                complained: summaryEmailStats ? summaryEmailStats.complained : 0,
            });

        } catch (error) {
            toast({ title: "Error Fetching Stats", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsFetchingStats(false);
        }
    };
    
    useEffect(() => {
        if (selectedProject) {
            fetchSenderDetails(selectedProject.siteId);
            setSelectedCampaignId('');
            setStatistics(null);
        }
    }, [selectedProject]);
    
    const handleImport = (siteId: string) => {
        const job = jobs[siteId] || initialJobState;
        if (!job.emails) {
            toast({ title: "No Emails", description: "Please enter emails to import.", variant: "destructive" });
            return;
        }
        jobManager.startJob(siteId, job.emails, job.delaySeconds);
    };
    
    const handlePauseResume = (siteId: string) => {
        const job = jobs[siteId];
        if (!job || !job.isLoading) return;

        if (job.isPaused) {
            jobManager.resumeJob(siteId);
            toast({ title: 'Job Resumed', description: 'The import will continue.' });
        } else {
            jobManager.pauseJob(siteId);
            toast({ title: 'Job Paused', description: 'The import will pause.' });
        }
    };

    const handleEndJob = (siteId: string) => {
        jobManager.cancelJob(siteId);
    };

    const handleSearch = async () => {
        if (!searchQuery) {
            toast({ title: "Search query is empty", variant: "destructive" });
            return;
        }
        setIsSearching(true);
        setSearchResults([]);
        setSelectedMembers([]);
        try {
            const response = await fetch('/api/headless-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery, siteId: selectedProject?.siteId }),
            });
            if (!response.ok) throw new Error(`Error: ${response.statusText}`);
            const data = await response.json();
            setSearchResults(data.members || []);
        } catch (error) {
            toast({ title: "Search failed", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsSearching(false);
        }
    };

    const handleDelete = async () => {
        if (selectedMembers.length === 0) {
            toast({ title: "No members selected", variant: "destructive" });
            return;
        }
        setIsDeleting(true);
        try {
            const membersToDelete = searchResults
                .filter(member => selectedMembers.includes(member.id))
                .map(member => ({ memberId: member.id, contactId: member.contactId }));

            const response = await fetch('/api/headless-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject?.siteId, membersToDelete }),
            });
            if (!response.ok) throw new Error(`Error: ${response.statusText}`);
            toast({ title: "Members deleted successfully" });
            setSearchResults(searchResults.filter(member => !selectedMembers.includes(member.id)));
            setSelectedMembers([]);
        } catch (error) {
            toast({ title: "Deletion failed", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleListAllMembers = async () => {
        if (!selectedProject) return;
        setAllMembersDialogOpen(true);
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
            setAllMembersDialogOpen(false);
        } finally {
            setIsFetchingAllMembers(false);
        }
    };

    const handleDeleteAllSelected = async () => {
        if (selectedAllMembers.length === 0) {
            toast({ title: "No members selected", variant: "destructive" });
            return;
        }
        setIsDeletingAll(true);
        try {
            const membersToDelete = allMembers
                .filter(member => selectedAllMembers.includes(member.id))
                .map(member => ({ memberId: member.id, contactId: member.contactId }));

            const response = await fetch('/api/headless-start-delete-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject?.siteId, membersToDelete }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to start deletion job.');
            }

            toast({ title: "Deletion Job Started", description: data.message });
            setAllMembers(allMembers.filter(member => !selectedAllMembers.includes(member.id)));
            setSelectedAllMembers([]);
            // Start polling for progress
            setDeleteProgress({ processed: 0, total: membersToDelete.length });
            setIsDeleteJobRunning(true);
        } catch (error: any) {
            toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsDeletingAll(false);
        }
    };

    const handleValidateLinks = async () => {
        if (!htmlToValidate || !selectedProject) {
            toast({ title: "Input Required", description: "Please select a project and enter some HTML to validate.", variant: "destructive" });
            return;
        }
        setIsLinkValidating(true);
        setValidationResults([]);
        try {
            const response = await fetch('/api/headless-validate-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, html: htmlToValidate }),
            });
            if (!response.ok) throw new Error('Failed to validate links.');
            const data = await response.json();
            setValidationResults(data.blacklistedLinks || []);
            toast({ title: "Validation Complete", description: `Found ${data.blacklistedLinks?.length || 0} blacklisted links.`});
        } catch (error) {
            toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsLinkValidating(false);
        }
    };

    const handleValidateUrl = async () => {
        if (!urlToValidate || !selectedProject) {
            toast({ title: "Input Required", description: "Please select a project and enter a URL to validate.", variant: "destructive" });
            return;
        }
        setIsUrlValidating(true);
        setUrlValidationResult(null);
        try {
            const response = await fetch('/api/headless-validate-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: selectedProject.siteId, url: urlToValidate }),
            });
            if (!response.ok) throw new Error('Failed to validate the URL.');
            const data = await response.json();
            setUrlValidationResult(data.valid 
                ? `✅ This link is valid and safe to use. : ${data.valid}` 
                : `❌ This link is blacklisted or invalid. : ${data.valid}`
            );
        } catch (error) {
            setUrlValidationResult(`Error: ${(error as Error).message}`);
        } finally {
            setIsUrlValidating(false);
        }
    };
    
    const handleSendTestEmail = async () => {
        if (!selectedCampaignId) {
            toast({ title: "No Campaign Selected", description: "Please select a campaign from the statistics section first.", variant: "destructive" });
            return;
        }
        if (!testEmailAddress) {
            toast({ title: "Recipient Email Required", description: "Please enter an email address to send the test to.", variant: "destructive" });
            return;
        }
        setIsSendingTest(true);
        setTestEmailResponse('');
        try {
            const response = await fetch('/api/headless-send-test-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    siteId: selectedProject?.siteId, 
                    campaignId: selectedCampaignId,
                    emailSubject: testEmailSubject,
                    toEmailAddress: testEmailAddress,
                }),
            });
            const responseData = await response.json();
            if (!response.ok) {
                 throw new Error(responseData.message || 'Failed to send test email.');
            }
            setTestEmailResponse(JSON.stringify(responseData, null, 2));
            toast({ title: "Test Email Sent", description: `Successfully sent a test to ${testEmailAddress}.`});
        } catch (error) {
            setTestEmailResponse(`Error: ${(error as Error).message}`);
            toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsSendingTest(false);
        }
    };
    
    const emailCount = currentJob?.emails.split(/[,\s\n]+/).filter(e => e.trim().includes('@')).length || 0;
    const availableCampaigns = selectedProject?.campaigns ? Object.entries(selectedProject.campaigns) : [];

    return (
        <div className="min-h-screen bg-gradient-subtle">
            <Navbar />
            <div className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="flex items-center justify-between gap-4 animate-fade-in">
                        <div className="flex items-center gap-4">
                            <Server className="h-10 w-10 text-primary" />
                            <div>
                                <h1 className="text-3xl font-bold">Headless</h1>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Input placeholder="Search by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }} className="w-40" />
                            <Button onClick={handleSearch} disabled={isSearching}><Search className="mr-2 h-4 w-4" />{isSearching ? '...' : ''}</Button>
                            <Button onClick={handleListAllMembers} variant="outline"><ListChecks className="mr-2 h-4 w-4" /> All</Button>
                            <Dialog open={isTestEmailOpen} onOpenChange={setTestEmailOpen}>
                                <DialogTrigger asChild><Button variant="outline"><Send className="mr-2 h-4 w-4" /> Test Email</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Send Test Email</DialogTitle>
                                        <DialogDescription>Send a test version of your selected campaign.</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <Input placeholder="Recipient Email" value={testEmailAddress} onChange={(e) => setTestEmailAddress(e.target.value)} />
                                        <Button onClick={handleSendTestEmail} disabled={isSendingTest || !selectedCampaignId}>
                                            {isSendingTest ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                            Send Test
                                        </Button>
                                        <Label>Server Response:</Label>
                                        <Textarea readOnly className="h-24 bg-muted" value={testEmailResponse || "Awaiting test send..."} />
                                    </div>
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isLinkValidatorOpen} onOpenChange={setLinkValidatorOpen}><DialogTrigger asChild><Button variant="outline"><Link className="mr-2 h-4 w-4" /> HTML</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>HTML Link Validator</DialogTitle><DialogDescription>Paste your HTML to check for blacklisted links.</DialogDescription></DialogHeader>
                                    <div className="space-y-4"><Textarea placeholder='<a href="http://example.com">...</a>' className="h-32" value={htmlToValidate} onChange={(e) => setHtmlToValidate(e.target.value)} /><Button onClick={handleValidateLinks} disabled={isLinkValidating}>{isLinkValidating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Validate</Button><Textarea readOnly className="h-24 bg-muted" value={validationResults.length > 0 ? validationResults.join('\n') : "No blacklisted links found."}/></div>
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isUrlValidatorOpen} onOpenChange={setUrlValidatorOpen}><DialogTrigger asChild><Button variant="outline"><Link2 className="mr-2 h-4 w-4" /> URL</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Single URL Validator</DialogTitle><DialogDescription>Enter a single URL to check if it's valid.</DialogDescription></DialogHeader>
                                    <div className="space-y-4">
                                        <Input placeholder="http://example.com" value={urlToValidate} onChange={(e) => setUrlToValidate(e.target.value)} />
                                        <Button onClick={handleValidateUrl} disabled={isUrlValidating}>{isUrlValidating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Validate</Button>
                                        <Textarea readOnly className="h-24 bg-muted" value={urlValidationResult || "Enter a URL and click validate."} />
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                
                    {(isSearching || searchResults.length > 0) && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                            <CardHeader className="flex flex-row justify-between items-center">
                                <div>
                                    <CardTitle>Search Results</CardTitle>
                                    <CardDescription>Found {searchResults.length} member(s). Select members to delete.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input placeholder="Filter results..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} className="w-40 h-8" />
                                    <Button variant="outline" size="sm" onClick={() => exportEmailsToTxt(filteredSearchResults, 'search-results-emails')}><Download className="mr-2 h-4 w-4"/>Export Emails</Button>
                                </div>
                            </CardHeader>
                            <CardContent><div className="border rounded-lg overflow-hidden">
                                <Table><TableHeader><TableRow><TableHead className="w-[40px]">#</TableHead><TableHead className="w-[50px]"><Checkbox checked={filteredSearchResults.length > 0 && selectedMembers.length === filteredSearchResults.length} onCheckedChange={(checked) => { const allMemberIds = checked ? filteredSearchResults.map(m => m.id) : []; setSelectedMembers(allMemberIds); }} /></TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
                                    <TableBody>{filteredSearchResults.slice().reverse().map((member, index) => (<TableRow key={member.id}><TableCell>{index + 1}</TableCell><TableCell><Checkbox checked={selectedMembers.includes(member.id)} onCheckedChange={(checked) => { setSelectedMembers(prev => checked ? [...prev, member.id] : prev.filter(id => id !== member.id)); }} /></TableCell><TableCell>{member.profile?.nickname || 'N/A'}</TableCell><TableCell>{member.loginEmail}</TableCell></TableRow>))}</TableBody>
                                </Table>
                            </div></CardContent>
                            {selectedMembers.length > 0 && (<CardFooter><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" disabled={isDeleting}><Trash2 className="mr-2 h-4 w-4" />{isDeleting ? 'Deleting...' : `Delete (${selectedMembers.length}) Selected`}</Button></AlertDialogTrigger>
                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the selected {selectedMembers.length} member(s). This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, Delete Members</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog></CardFooter>)}
                        </Card>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="bg-gradient-card shadow-card border-primary/10 h-full">
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
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete the project "{selectedProject?.projectName}". This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteProject}>
                                                    Continue
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Select value={selectedProject?.siteId} onValueChange={(siteId) => { const project = headlessProjects.find(p => p.siteId === siteId); setSelectedProject(project); }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a project..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {headlessProjects.map(project => {
                                            const jobState = jobs[project.siteId];
                                            let statusText = "Idle";
                                            if (jobState?.isLoading && !jobState.isPaused) statusText = "Processing";
                                            if (jobState?.isPaused) statusText = "Paused";
                                            return (
                                                <SelectItem key={project.siteId} value={project.siteId}>
                                                    <div className="flex justify-between w-full items-center">
                                                        <span>{project.projectName}</span>
                                                        {jobState?.isLoading && (
                                                            <span className="text-xs text-muted-foreground ml-4">
                                                                {jobState.processedEmails}/{jobState.totalEmails} {statusText}
                                                            </span>
                                                        )}
                                                    </div>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </CardContent>
                        </Card>
                        <Card className="bg-gradient-card shadow-card border-primary/10 h-full">
                            <CardHeader><CardTitle>Sender Details</CardTitle></CardHeader>
                            <CardContent><div className="flex items-center gap-2"><Input placeholder="Loading sender name..." value={senderDetails?.fromName || ''} onChange={(e) => setSenderDetails(prev => prev ? { ...prev, fromName: e.target.value } : null)} disabled={isFetchingSender || isUpdatingSender} /><Button onClick={handleUpdateSenderName} disabled={isUpdatingSender || !senderDetails} size="icon"><Save className="h-4 w-4" /></Button><Button onClick={() => selectedProject && fetchSenderDetails(selectedProject.siteId)} disabled={isFetchingSender} variant="outline" size="icon"><RefreshCw className={`h-4 w-4 ${isFetchingSender ? 'animate-spin' : ''}`} /></Button></div>
                                {senderDetails && <p className="text-xs text-muted-foreground mt-2">Sender Email: {senderDetails.fromEmail}</p>}
                            </CardContent>
                        </Card>
                    </div>

                    <Dialog open={isProjectDialogOpen} onOpenChange={setProjectDialogOpen}>
                        {/* ... (DialogContent for adding/editing projects) ... */}
                    </Dialog>

                    <Dialog open={isAllMembersDialogOpen} onOpenChange={setAllMembersDialogOpen}>
                        <DialogContent className="max-w-4xl">
                            <DialogHeader className="flex-row justify-between items-center">
                                <div>
                                    <DialogTitle>Manage All Members</DialogTitle>
                                    <DialogDescription>View, select, and delete all members from this site.</DialogDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input placeholder="Filter results..." value={allMembersFilterQuery} onChange={(e) => setAllMembersFilterQuery(e.target.value)} className="w-40 h-8" />
                                    <Button variant="outline" size="sm" onClick={() => exportEmailsToTxt(filteredAllMembers, 'all-members-emails')}><Download className="mr-2 h-4 w-4"/>Export Emails</Button>
                                </div>
                            </DialogHeader>
                            <div className="max-h-[60vh] overflow-y-auto">
                                {isFetchingAllMembers ? <div className="text-center py-8"><RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div> : filteredAllMembers.length > 0 ? (
                                    <Table>
                                        {/* ... (Table for all members) ... */}
                                    </Table>
                                ) : <p className="text-center py-8 text-muted-foreground">No members found.</p>}
                            </div>
                            
                            {isDeleteJobRunning ? (
                                <div className="pt-4 px-6 pb-2">
                                    <Label>Deletion in progress...</Label>
                                    <Progress value={(deleteProgress.processed / deleteProgress.total) * 100} className="w-full mt-2" />
                                    <p className="text-sm text-muted-foreground mt-1 text-center">
                                        {deleteProgress.processed} / {deleteProgress.total} members deleted
                                    </p>
                                </div>
                            ) : selectedAllMembers.length > 0 && (
                                <DialogFooter>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" disabled={isDeletingAll}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {isDeletingAll ? 'Starting Job...' : `Delete (${selectedAllMembers.length}) Selected`}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription>This action will start a background job to delete the selected {selectedAllMembers.length} member(s). You can close the window and the process will continue.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteAllSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, Start Deletion Job</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DialogFooter>
                            )}
                        </DialogContent>
                    </Dialog>

                    <Card className="bg-gradient-card shadow-card border-primary/10">
                        {/* ... (Campaign Statistics Card) ... */}
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* ... (Bulk User Import and Import Job Settings Cards) ... */}
                    </div>

                    <Card className="bg-gradient-primary text-primary-foreground shadow-glow">
                        {/* ... (Ready to Import? Card) ... */}
                    </Card>

                    {currentJob?.results && currentJob.results.length > 0 && (
                        <Card className="bg-gradient-card shadow-card border-primary/10">
                           {/* ... (Import Results Card) ... */}
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

interface StatCardProps {
    icon: React.ElementType;
    title: string;
    recipients?: CampaignRecipient[];
    count?: number;
    activity?: string;
    onRecipientClick?: (data: {title: string, recipients: CampaignRecipient[]}) => void;
}

function StatCard({ icon: Icon, title, recipients, count, activity, onRecipientClick }: StatCardProps) {
    const value = typeof count === 'number' ? count : recipients?.length ?? 0;
    const canViewRecipients = onRecipientClick && recipients && activity;

    return (
        <Card className="p-4">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-0">
                <div className="text-2xl font-bold">{value}</div>
                {canViewRecipients ? (
                    <Button 
                        variant="link" 
                        className="p-0 h-auto text-xs text-muted-foreground" 
                        onClick={() => { 
                            if(onRecipientClick && recipients && activity) {
                                onRecipientClick({ title: activity, recipients: recipients }); 
                                document.getElementById('recipient-dialog-trigger')?.click(); 
                            }
                        }}
                    >
                        View Recipients
                    </Button>
                ) : (
                    <div className="h-6 text-xs text-muted-foreground/50">—</div>
                )}
            </CardContent>
        </Card>
    );
}