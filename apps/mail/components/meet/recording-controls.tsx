import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Circle, Square, Loader2 } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation, useQuery } from '@tanstack/react-query';

interface RecordingControlsProps {
  meetingId: string;
  isHost: boolean;
  recordingEnabled: boolean;
}

export function RecordingControls({ meetingId, isHost, recordingEnabled }: RecordingControlsProps) {
  const trpc = useTRPC();
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);

  // Get active recordings for this meeting
  const { data: recordings, refetch: refetchRecordings } = useQuery(
    trpc.livekit.getRecordings.queryOptions({
      meetingId,
    }),
  );

  // Start recording mutation
  const { mutateAsync: startRecording, isPending: isStarting } = useMutation(
    trpc.livekit.startRecording.mutationOptions(),
  );

  // Stop recording mutation
  const { mutateAsync: stopRecording, isPending: isStopping } = useMutation(
    trpc.livekit.stopRecording.mutationOptions(),
  );

  const activeRecording = recordings?.find((r) => r.status === 'recording');
  const isRecording = !!activeRecording;

  const handleStartRecording = async () => {
    try {
      const result = await startRecording({ meetingId });
      setCurrentRecordingId(result.recordingId);
      await refetchRecordings();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    if (!currentRecordingId && !activeRecording?.id) return;

    try {
      await stopRecording({
        meetingId,
        recordingId: currentRecordingId || activeRecording!.id,
      });
      setCurrentRecordingId(null);
      await refetchRecordings();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  // Only show for host
  if (!isHost) {
    return null;
  }

  // Show message if recording is not enabled
  if (!recordingEnabled) {
    return (
      <div className="absolute top-4 right-4 z-50">
        <div className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          Recording not enabled for this meeting
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
      {isRecording && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-1.5 text-sm text-red-600 dark:text-red-400">
          <Circle className="h-3 w-3 fill-current animate-pulse" />
          Recording
        </div>
      )}

      <Button
        size="sm"
        variant={isRecording ? 'destructive' : 'default'}
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        disabled={isStarting || isStopping}
      >
        {isStarting || isStopping ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isStarting ? 'Starting...' : 'Stopping...'}
          </>
        ) : isRecording ? (
          <>
            <Square className="mr-2 h-4 w-4" />
            Stop Recording
          </>
        ) : (
          <>
            <Circle className="mr-2 h-4 w-4" />
            Start Recording
          </>
        )}
      </Button>
    </div>
  );
}
