import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart2, RefreshCw, Download, MailCheck, Users, MousePointerClick, MailX, AlertCircle, MailMinus } from "lucide-react";
import Navbar from '@/components/Navbar';
import { useToast } from "@/hooks/use-toast";

// Define the types for our data
interface HeadlessProject {
  projectName: string;
  siteId: string;
  apiKey: string;
  campaigns?: { [key: string]: string; };
}

interface CampaignRecipient {
  contactId: string;
  lastActivityDate: string;
  emailAddress?: string;
  fullName?: string;
}

// ★★★ ADD: Define the shape of the summary statistics ★★★
interface CampaignSummaryStats {
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    notSent: number;
}

const activityTypes = [
    { value: 'DELIVERED', label: 'Delivered' },
    { value: 'OPENED', label: 'Opened' },
    { value: 'CLICKED', label: 'Clicked' },
    { value: 'BOUNCED', label: 'Bounced' },
    { value: 'NOT_SENT', label: 'Not Sent' },
];

const exportEmailsToTxt = (data: any[], filename: string) => {
    const emails = data.map(row => row.emailAddress).filter(Boolean);
    if (emails.length === 0) {
        alert("No emails to export.");
        return;
    }
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

const CampaignStatsPage = () => {
  const [headlessProjects, setHeadlessProjects] = useState<HeadlessProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<HeadlessProject | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [selectedActivity, setSelectedActivity] = useState<string>('');
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const { toast } = useToast();

  // ★★★ ADD: New state for summary statistics ★★★
  const [summaryStats, setSummaryStats] = useState<CampaignSummaryStats | null>(null);
  const [isFetchingSummary, setIsFetchingSummary] = useState(false);


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

  // ★★★ ADD: New function to fetch only the summary stats ★★★
  const fetchSummaryStats = async (projectId: string, campaignId: string) => {
    setIsFetchingSummary(true);
    setSummaryStats(null);
    try {
        const response = await fetch('/api/headless-get-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId: projectId, campaignIds: [campaignId] }),
        });
        if (!response.ok) throw new Error('Failed to fetch campaign summary.');
        const data = await response.json();
        if (data.statistics && data.statistics.length > 0) {
            setSummaryStats(data.statistics[0].email);
        } else {
            setSummaryStats(null);
        }
    } catch (error) {
        toast({ title: "Error Fetching Summary", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsFetchingSummary(false);
    }
  };


  const handleFetchRecipients = async () => {
    if (!selectedProject || !selectedCampaignId || !selectedActivity) {
      toast({ title: "Selection Required", description: "Please select a project, campaign, and activity type.", variant: "destructive" });
      return;
    }

    setIsFetching(true);
    setRecipients([]);
    try {
      const response = await fetch('/api/headless-get-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedProject.siteId,
          campaignId: selectedCampaignId,
          activity: selectedActivity
        }),
      });
      if (!response.ok) throw new Error(`Failed to fetch ${selectedActivity.toLowerCase()} recipients.`);
      const data = await response.json();
      setRecipients(data.recipients || []);
    } catch (error) {
      toast({ title: "Error Fetching Recipients", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsFetching(false);
    }
  };

  const availableCampaigns = selectedProject?.campaigns ? Object.entries(selectedProject.campaigns) : [];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center gap-4">
            <BarChart2 className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Campaign Statistics</h1>
              <p className="text-muted-foreground">View recipient lists for your email campaigns.</p>
            </div>
          </div>
          
          {/* ★★★ NEW: Display summary stats here ★★★ */}
          {selectedCampaignId && (
            <Card className="bg-gradient-card shadow-card border-primary/10">
              <CardHeader>
                  <CardTitle>Campaign Overview</CardTitle>
                  <CardDescription>A high-level summary of the selected campaign's performance.</CardDescription>
              </CardHeader>
              <CardContent>
                {isFetchingSummary ? <div className="text-center py-4"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div> :
                  summaryStats ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
                      <SummaryStat icon={MailCheck} title="Delivered" value={summaryStats.delivered} />
                      <SummaryStat icon={Users} title="Opened" value={summaryStats.opened} />
                      <SummaryStat icon={MousePointerClick} title="Clicked" value={summaryStats.clicked} />
                      <SummaryStat icon={MailX} title="Bounced" value={summaryStats.bounced} />
                      <SummaryStat icon={AlertCircle} title="Complained" value={summaryStats.complained} />
                      <SummaryStat icon={MailMinus} title="Not Sent" value={summaryStats.notSent} />
                    </div>
                  ) : <p className="text-muted-foreground">No summary data available.</p>
                }
              </CardContent>
            </Card>
          )}

          <Card className="bg-gradient-card shadow-card border-primary/10">
            <CardHeader>
              <CardTitle>View Recipient Lists</CardTitle>
              <CardDescription>Choose a project, campaign, and activity type to view the list of recipients.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  value={selectedProject?.siteId || ''}
                  onValueChange={(siteId) => {
                    const project = headlessProjects.find(p => p.siteId === siteId) || null;
                    setSelectedProject(project);
                    setSelectedCampaignId('');
                    setSelectedActivity('');
                    setRecipients([]);
                    setSummaryStats(null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                  <SelectContent>
                    {headlessProjects.map(project => (
                      <SelectItem key={project.siteId} value={project.siteId}>{project.projectName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedCampaignId}
                  onValueChange={(campaignId) => {
                      setSelectedCampaignId(campaignId);
                      if (selectedProject && campaignId) {
                          fetchSummaryStats(selectedProject.siteId, campaignId);
                      } else {
                          setSummaryStats(null);
                      }
                  }}
                  disabled={!selectedProject || availableCampaigns.length === 0}
                >
                  <SelectTrigger><SelectValue placeholder="Select a campaign..." /></SelectTrigger>
                  <SelectContent>
                    {availableCampaigns.map(([name, id]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedActivity}
                  onValueChange={setSelectedActivity}
                  disabled={!selectedCampaignId}
                >
                  <SelectTrigger><SelectValue placeholder="Select activity type..." /></SelectTrigger>
                  <SelectContent>
                    {activityTypes.map(activity => (
                      <SelectItem key={activity.value} value={activity.value}>{activity.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleFetchRecipients} disabled={isFetching || !selectedActivity}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Fetching...' : 'Fetch Recipients'}
              </Button>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-card shadow-card border-primary/10">
            <CardHeader className="flex flex-row justify-between items-center">
                <div>
                    <CardTitle>Recipient List</CardTitle>
                    <CardDescription>
                        Showing {recipients.length} recipient(s) for the "{selectedActivity}" activity.
                    </CardDescription>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportEmailsToTxt(recipients, `recipients-${selectedActivity}-emails`)}
                    disabled={recipients.length === 0}
                >
                    <Download className="mr-2 h-4 w-4"/>
                    Export Emails
                </Button>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email Address</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Last Activity Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isFetching ? (
                      <TableRow><TableCell colSpan={3} className="text-center">Loading...</TableCell></TableRow>
                    ) : recipients.length > 0 ? (
                      recipients.map(recipient => (
                        <TableRow key={recipient.contactId}>
                          <TableCell>{recipient.emailAddress || 'N/A'}</TableCell>
                          <TableCell>{recipient.fullName || 'N/A'}</TableCell>
                          <TableCell>{new Date(recipient.lastActivityDate).toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={3} className="text-center">No recipients to display. Please make a selection and fetch data.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ★★★ ADD: A small component for the summary stats ★★★
const SummaryStat = ({ icon: Icon, title, value }: { icon: React.ElementType, title: string, value: number }) => (
    <div className="flex flex-col items-center gap-1 p-2 rounded-md">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <p className="text-xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{title}</p>
    </div>
);

export default CampaignStatsPage;