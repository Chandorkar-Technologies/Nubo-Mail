import { useState } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Video, Calendar, Users, Clock, Plus, Share2, Trash2 } from 'lucide-react';
import { CreateMeetingDialog } from '@/components/livekit/create-meeting-dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function MeetingsPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null);

  const { data: meetings, isLoading, refetch } = useQuery(
    trpc.livekit.list.queryOptions({
      limit: 50,
    }),
  );

  const { mutateAsync: endMeeting, isPending: isEnding } = useMutation(
    trpc.livekit.end.mutationOptions(),
  );

  const handleMeetingCreated = (meetingId: string) => {
    setIsCreateDialogOpen(false);
    refetch();
    navigate(`/meet/${meetingId}`);
  };

  const handleJoinMeeting = (meetingId: string) => {
    navigate(`/meet/${meetingId}`);
  };

  const handleShareMeeting = (meetingId: string) => {
    const meetingUrl = `${window.location.origin}/meet/${meetingId}`;
    navigator.clipboard.writeText(meetingUrl);
    toast.success('Meeting link copied to clipboard!');
  };

  const handleEndMeeting = async () => {
    if (!meetingToDelete) return;

    try {
      await endMeeting({ meetingId: meetingToDelete });
      toast.success('Meeting ended successfully');
      refetch();
    } catch (error) {
      toast.error('Failed to end meeting');
      console.error('Failed to end meeting:', error);
    } finally {
      setMeetingToDelete(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'scheduled':
        return 'bg-blue-500';
      case 'ended':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Meetings</h1>
          <p className="text-muted-foreground">Manage your video meetings</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Meeting
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="text-muted-foreground">Loading meetings...</div>
          </div>
        </div>
      ) : meetings && meetings.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <Card key={meeting.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{meeting.title}</CardTitle>
                  </div>
                  <Badge className={getStatusColor(meeting.status)}>
                    {meeting.status}
                  </Badge>
                </div>
                {meeting.description && (
                  <CardDescription>{meeting.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {meeting.scheduledFor && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(meeting.scheduledFor), 'PPp')}
                    </div>
                  )}
                  {meeting.startedAt && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Started {format(new Date(meeting.startedAt), 'PPp')}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Max {meeting.maxParticipants} participants
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  {meeting.status === 'active' || meeting.status === 'scheduled' ? (
                    <>
                      <Button
                        className="flex-1"
                        onClick={() => handleJoinMeeting(meeting.id)}
                      >
                        Join Meeting
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleShareMeeting(meeting.id)}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setMeetingToDelete(meeting.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        className="flex-1"
                        variant="outline"
                        disabled
                      >
                        Meeting Ended
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleShareMeeting(meeting.id)}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12">
          <Video className="mb-4 h-16 w-16 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No meetings yet</h3>
          <p className="text-muted-foreground mb-4">Create your first meeting to get started</p>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Meeting
          </Button>
        </div>
      )}

      <CreateMeetingDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onMeetingCreated={handleMeetingCreated}
      />

      <AlertDialog open={!!meetingToDelete} onOpenChange={() => setMeetingToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the meeting and remove all participants. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndMeeting} disabled={isEnding}>
              {isEnding ? 'Ending...' : 'End Meeting'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
