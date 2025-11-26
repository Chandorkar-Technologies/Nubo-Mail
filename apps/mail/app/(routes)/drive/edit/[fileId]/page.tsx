import { useEffect, useRef, useState } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: any) => {
        destroyEditor: () => void;
      };
    };
  }
}

export default function EditorPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get file details
  const { data: file } = useQuery(
    trpc.drive.getFile.queryOptions({ fileId: fileId! }, { enabled: !!fileId }),
  );

  // Get editor config
  const { mutateAsync: getEditorConfig, isPending } = useMutation(
    trpc.drive.getEditorConfig.mutationOptions(),
  );

  useEffect(() => {
    if (!fileId) return;

    let mounted = true;
    let scriptElement: HTMLScriptElement | null = null;

    const initEditor = async () => {
      try {
        const { config, onlyOfficeUrl } = await getEditorConfig({ fileId });

        if (!mounted) return;

        // Load OnlyOffice Document Server API script
        const script = document.createElement('script');
        script.src = `${onlyOfficeUrl}/web-apps/apps/api/documents/api.js`;
        script.async = true;

        script.onload = () => {
          if (!mounted) return;

          if (!window.DocsAPI) {
            setError('Failed to load OnlyOffice editor API');
            return;
          }

          try {
            // Initialize the editor
            const editor = new window.DocsAPI.DocEditor('onlyoffice-editor', {
              ...config,
              width: '100%',
              height: '100%',
              events: {
                onAppReady: () => {
                  if (mounted) {
                    setEditorLoaded(true);
                  }
                },
                onDocumentStateChange: (event: { data: boolean }) => {
                  // event.data is true when document is modified
                  console.log('Document modified:', event.data);
                },
                onError: (event: { data: { errorCode: number; errorDescription: string } }) => {
                  console.error('OnlyOffice error:', event.data);
                  if (mounted) {
                    setError(`Editor error: ${event.data.errorDescription}`);
                  }
                },
              },
            });

            editorRef.current = editor;
          } catch (initError) {
            console.error('Failed to initialize editor:', initError);
            if (mounted) {
              setError('Failed to initialize editor');
            }
          }
        };

        script.onerror = () => {
          console.error('Failed to load OnlyOffice API script');
          if (mounted) {
            setError('Failed to load OnlyOffice editor. Please check the server configuration.');
          }
        };

        document.body.appendChild(script);
        scriptElement = script;
      } catch (err) {
        console.error('Failed to get editor config:', err);
        if (mounted) {
          setError('Failed to initialize editor');
        }
      }
    };

    initEditor();

    return () => {
      mounted = false;
      // Destroy editor instance
      if (editorRef.current) {
        try {
          editorRef.current.destroyEditor();
        } catch (e) {
          console.error('Error destroying editor:', e);
        }
        editorRef.current = null;
      }
      // Remove script
      if (scriptElement && scriptElement.parentNode) {
        scriptElement.parentNode.removeChild(scriptElement);
      }
    };
  }, [fileId, getEditorConfig]);

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => navigate('/drive')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Drive
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background">
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
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
