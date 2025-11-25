import { useTRPC } from '@/providers/query-provider';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Download, Loader2, Video, Clock, HardDrive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RecordingsListProps {
  meetingId: string;
}

export function RecordingsList({ meetingId }: RecordingsListProps) {
  const trpc = useTRPC();

  // Get recordings for this meeting
  const { data: recordings, isLoading } = useQuery(
    trpc.livekit.getRecordings.queryOptions({
      meetingId,
    }),
  );

  // Get recording URL mutation
  const { mutateAsync: getRecordingUrl, isPending: isLoadingUrl } = useMutation(
    trpc.livekit.getRecordingUrl.mutationOptions(),
  );

  const handlePlay = async (recordingId: string) => {
    try {
      const result = await getRecordingUrl({ recordingId });
      // Open in new tab
      window.open(result.url, '_blank');
    } catch (error) {
      console.error('Failed to get recording URL:', error);
    }
  };

  const handleDownload = async (recordingId: string, fileName: string) => {
    try {
      const result = await getRecordingUrl({ recordingId });
      // Create download link
      const a = document.createElement('a');
      a.href = result.url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download recording:', error);
    }
  };

  const formatBytes = (bytes: number | null | undefined) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return 'Unknown';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!recordings || recordings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <Video className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No recordings yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Recordings will appear here after the meeting is recorded
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Recordings</h3>
      <div className="space-y-3">
        {recordings.map((recording) => (
          <Card key={recording.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Video className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{recording.fileName}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(recording.duration)}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {formatBytes(recording.fileSize)}
                      </span>
                      {recording.startedAt && (
                        <span>
                          {formatDistanceToNow(new Date(recording.startedAt), { addSuffix: true })}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {recording.status === 'ready' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePlay(recording.id)}
                        disabled={isLoadingUrl}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Play
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(recording.id, recording.fileName)}
                        disabled={isLoadingUrl}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </>
                  ) : recording.status === 'recording' ? (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                      <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                      Recording
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
