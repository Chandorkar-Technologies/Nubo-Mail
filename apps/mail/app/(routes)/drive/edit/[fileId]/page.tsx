import { useEffect, useRef, useState } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: any) => any;
    };
  }
}

export default function EditorPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get file details
  const { data: file } = useQuery(
    trpc.drive.getFile.queryOptions({ fileId: fileId! }),
    { enabled: !!fileId },
  );

  // Get editor config
  const { mutateAsync: getEditorConfig, isPending } = useMutation(
    trpc.drive.getEditorConfig.mutationOptions(),
  );

  useEffect(() => {
    if (!fileId) return;

    let editorInstance: any = null;

    const initEditor = async () => {
      try {
        const { config, onlyOfficeUrl } = await getEditorConfig({ fileId });

        // Load OnlyOffice API script
        const script = document.createElement('script');
        script.src = `${onlyOfficeUrl}/web-apps/apps/api/documents/api.js`;
        script.async = true;

        script.onload = () => {
          if (window.DocsAPI && editorRef.current) {
            editorInstance = new window.DocsAPI.DocEditor('onlyoffice-editor', {
              ...config,
              width: '100%',
              height: '100%',
              events: {
                onAppReady: () => {
                  setEditorLoaded(true);
                },
                onDocumentStateChange: (event: any) => {
                  // Document modified
                  console.log('Document state changed:', event);
                },
                onError: (event: any) => {
                  console.error('OnlyOffice error:', event);
                  setError('Editor error occurred');
                },
              },
            });
          }
        };

        script.onerror = () => {
          setError('Failed to load OnlyOffice editor');
        };

        document.body.appendChild(script);

        return () => {
          if (editorInstance) {
            editorInstance.destroyEditor?.();
          }
          document.body.removeChild(script);
        };
      } catch (err) {
        console.error('Failed to initialize editor:', err);
        setError('Failed to initialize editor');
      }
    };

    initEditor();

    return () => {
      // Cleanup will be handled by the async function
    };
  }, [fileId, getEditorConfig]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => navigate('/drive')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Drive
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b p-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/drive')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-medium">{file?.name || 'Loading...'}</h1>
        </div>
        {!editorLoaded && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading editor...
          </div>
        )}
      </div>

      {/* Editor Container */}
      <div className="flex-1 relative">
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
        <div
          id="onlyoffice-editor"
          ref={editorRef}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
