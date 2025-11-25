import { useState } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Circle, Square, Loader2 } from 'lucide-react';

interface RecordingButtonProps {
  meetingId: string;
  isHost: boolean;
  recordingEnabled: boolean;
}

export function RecordingButton({ meetingId, isHost, recordingEnabled }: RecordingButtonProps) {
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

  // Only show for host with recording enabled
  if (!isHost || !recordingEnabled) {
    return null;
  }

  return (
    <button
      className="lk-button"
      onClick={isRecording ? handleStopRecording : handleStartRecording}
      disabled={isStarting || isStopping}
      title={isRecording ? 'Stop Recording' : 'Start Recording'}
    >
      {isStarting || isStopping ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : isRecording ? (
        <>
          <Square className="h-5 w-5" fill="currentColor" />
          <span className="lk-button-label">Stop Recording</span>
        </>
      ) : (
        <>
          <Circle className="h-5 w-5" fill="currentColor" />
          <span className="lk-button-label">Record</span>
        </>
      )}
    </button>
  );
}
