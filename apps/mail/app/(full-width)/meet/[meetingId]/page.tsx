import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTRPC } from '@/providers/query-provider';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { Loader2 } from 'lucide-react';
import { GuestJoinForm } from '@/components/meet/guest-join-form';

export default function MeetingRoomPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [token, setToken] = useState<string>('');
  const [wsUrl, setWsUrl] = useState<string>('');
  const [isGuest, setIsGuest] = useState(false);
  const [_guestName, setGuestName] = useState('');
  const [showGuestForm, setShowGuestForm] = useState(false);

  // Get meeting details
  const { data: meeting } = useQuery(
    trpc.livekit.get.queryOptions({
      meetingId: meetingId!,
    }),
  );

  // Get authenticated user access token
  const { mutateAsync: getToken, isPending: tokenLoading } = useMutation(
    trpc.livekit.getToken.mutationOptions(),
  );

  // Get guest access token
  const { mutateAsync: getGuestToken, isPending: guestTokenLoading } = useMutation(
    trpc.livekit.getGuestToken.mutationOptions(),
  );

  useEffect(() => {
    if (meetingId && !token && !showGuestForm) {
      // Try to get authenticated token first
      getToken({ meetingId })
        .then((response) => {
          setToken(response.token);
          setWsUrl(response.wsUrl);
          setIsGuest(false);
        })
        .catch((error) => {
          console.error('Failed to get authenticated token:', error);
          // If auth fails, show guest form
          setShowGuestForm(true);
        });
    }
  }, [meetingId, getToken, token, showGuestForm]);

  const handleGuestJoin = async (name: string) => {
    if (!meetingId) return;

    try {
      const response = await getGuestToken({ meetingId, name });
      setToken(response.token);
      setWsUrl(response.wsUrl);
      setGuestName(name);
      setIsGuest(true);
      setShowGuestForm(false);
    } catch (error) {
      console.error('Failed to join as guest:', error);
    }
  };

  const handleDisconnect = () => {
    if (isGuest) {
      // Guests go to home page
      navigate('/');
    } else {
      // Authenticated users go to meetings list
      navigate('/meet');
    }
  };

  // Show guest form if needed
  if (showGuestForm) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <GuestJoinForm
          meetingTitle={meeting?.title || 'Meeting'}
          onJoin={handleGuestJoin}
          isLoading={guestTokenLoading}
        />
      </div>
    );
  }

  // Show loading state
  if (tokenLoading || guestTokenLoading || !token || !wsUrl) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Joining meeting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative">
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={wsUrl}
        onDisconnected={handleDisconnect}
        data-lk-theme="default"
        className="h-full w-full"
      >
        <VideoConference
          chatMessageFormatter={(message) => message}
          SettingsComponent={undefined}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
