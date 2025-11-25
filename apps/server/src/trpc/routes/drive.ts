import { privateProcedure, router } from '../trpc';
import { driveFile, driveFolder, driveImportJob } from '../../db/schema';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { env } from '../../env';

// Helper to get file extension
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

// Helper to check if file is editable in OnlyOffice
function isEditableInOnlyOffice(_mimeType: string, filename: string): boolean {
  const ext = getFileExtension(filename);
  const editableExtensions = [
    // Documents
    'doc', 'docx', 'odt', 'rtf', 'txt',
    // Spreadsheets
    'xls', 'xlsx', 'ods', 'csv',
    // Presentations
    'ppt', 'pptx', 'odp',
    // PDF (view/edit)
    'pdf',
  ];
  return editableExtensions.includes(ext);
}

// Helper to get mime type category
function getMimeCategory(mimeType: string): 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'image' | 'video' | 'audio' | 'other' {
  if (mimeType.includes('word') || mimeType.includes('document') || mimeType === 'text/plain') return 'document';
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'other';
}

export const driveRouter = router({
  // List files and folders in a directory
  listContents: privateProcedure
    .input(
      z.object({
        folderId: z.string().nullable().optional(), // null or undefined = root
        sortBy: z.enum(['name', 'created', 'updated', 'size']).default('name'),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
        filter: z.enum(['all', 'files', 'folders', 'starred', 'trashed']).default('all'),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const { folderId, sortBy, sortOrder, filter } = input;

      // Get folders (unless filtering for files only or trashed)
      let folders: typeof driveFolder.$inferSelect[] = [];
      if (filter !== 'files' && filter !== 'trashed') {
        const folderConditions = [eq(driveFolder.userId, sessionUser.id)];

        if (folderId) {
          folderConditions.push(eq(driveFolder.parentId, folderId));
        } else {
          folderConditions.push(isNull(driveFolder.parentId));
        }

        folders = await ctx.db
          .select()
          .from(driveFolder)
          .where(and(...folderConditions))
          .orderBy(sortOrder === 'asc' ? asc(driveFolder.name) : desc(driveFolder.name));
      }

      // Get files
      let files: typeof driveFile.$inferSelect[] = [];
      if (filter !== 'folders') {
        const fileConditions = [eq(driveFile.userId, sessionUser.id)];

        if (filter === 'trashed') {
          fileConditions.push(eq(driveFile.isTrashed, true));
        } else {
          fileConditions.push(eq(driveFile.isTrashed, false));

          if (filter === 'starred') {
            fileConditions.push(eq(driveFile.isStarred, true));
          } else if (folderId) {
            fileConditions.push(eq(driveFile.folderId, folderId));
          } else {
            fileConditions.push(isNull(driveFile.folderId));
          }
        }

        const orderByColumn = {
          name: driveFile.name,
          created: driveFile.createdAt,
          updated: driveFile.updatedAt,
          size: driveFile.size,
        }[sortBy];

        files = await ctx.db
          .select()
          .from(driveFile)
          .where(and(...fileConditions))
          .orderBy(sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn));
      }

      // Enrich files with additional metadata
      const enrichedFiles = files.map((file) => ({
        ...file,
        isEditable: isEditableInOnlyOffice(file.mimeType, file.name),
        category: getMimeCategory(file.mimeType),
        extension: getFileExtension(file.name),
      }));

      return {
        folders,
        files: enrichedFiles,
      };
    }),

  // Get folder details and breadcrumb path
  getFolder: privateProcedure
    .input(z.object({ folderId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const folder = await ctx.db.query.driveFolder.findFirst({
        where: and(
          eq(driveFolder.id, input.folderId),
          eq(driveFolder.userId, sessionUser.id),
        ),
      });

      if (!folder) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found' });
      }

      // Build breadcrumb path
      const breadcrumbs: { id: string; name: string }[] = [];
      let currentFolder: typeof folder | undefined = folder;

      while (currentFolder) {
        breadcrumbs.unshift({ id: currentFolder.id, name: currentFolder.name });

        if (currentFolder.parentId) {
          currentFolder = await ctx.db.query.driveFolder.findFirst({
            where: and(
              eq(driveFolder.id, currentFolder.parentId),
              eq(driveFolder.userId, sessionUser.id),
            ),
          });
        } else {
          break;
        }
      }

      return {
        folder,
        breadcrumbs,
      };
    }),

  // Create a new folder
  createFolder: privateProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        parentId: z.string().nullable().optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const folderId = crypto.randomUUID();

      // Verify parent folder exists and belongs to user (if provided)
      if (input.parentId) {
        const parentFolder = await ctx.db.query.driveFolder.findFirst({
          where: and(
            eq(driveFolder.id, input.parentId),
            eq(driveFolder.userId, sessionUser.id),
          ),
        });

        if (!parentFolder) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent folder not found' });
        }
      }

      await ctx.db.insert(driveFolder).values({
        id: folderId,
        userId: sessionUser.id,
        name: input.name,
        parentId: input.parentId || null,
        color: input.color,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { id: folderId };
    }),

  // Rename folder
  renameFolder: privateProcedure
    .input(
      z.object({
        folderId: z.string(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      await ctx.db
        .update(driveFolder)
        .set({ name: input.name, updatedAt: new Date() })
        .where(
          and(
            eq(driveFolder.id, input.folderId),
            eq(driveFolder.userId, sessionUser.id),
          ),
        );

      return { success: true };
    }),

  // Delete folder (and all contents recursively)
  deleteFolder: privateProcedure
    .input(z.object({ folderId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      // Verify folder exists and belongs to user
      const folder = await ctx.db.query.driveFolder.findFirst({
        where: and(
          eq(driveFolder.id, input.folderId),
          eq(driveFolder.userId, sessionUser.id),
        ),
      });

      if (!folder) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found' });
      }

      // Get all files in this folder to delete from R2
      const filesToDelete = await ctx.db.query.driveFile.findMany({
        where: eq(driveFile.folderId, input.folderId),
      });

      // Delete files from R2
      const bucket = env.THREADS_BUCKET;
      for (const file of filesToDelete) {
        try {
          await bucket.delete(file.r2Key);
          if (file.thumbnailR2Key) {
            await bucket.delete(file.thumbnailR2Key);
          }
        } catch (e) {
          console.error(`Failed to delete file from R2: ${file.r2Key}`, e);
        }
      }

      // Delete folder (cascade will delete files from DB)
      await ctx.db.delete(driveFolder).where(eq(driveFolder.id, input.folderId));

      return { success: true };
    }),

  // Get file details
  getFile: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const file = await ctx.db.query.driveFile.findFirst({
        where: and(
          eq(driveFile.id, input.fileId),
          eq(driveFile.userId, sessionUser.id),
        ),
      });

      if (!file) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
      }

      return {
        ...file,
        isEditable: isEditableInOnlyOffice(file.mimeType, file.name),
        category: getMimeCategory(file.mimeType),
        extension: getFileExtension(file.name),
      };
    }),

  // Get download URL for a file
  getDownloadUrl: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const file = await ctx.db.query.driveFile.findFirst({
        where: and(
          eq(driveFile.id, input.fileId),
          eq(driveFile.userId, sessionUser.id),
        ),
      });

      if (!file) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
      }

      // Get file from R2 and generate a temporary URL
      // For now, return the R2 key - in production you'd generate a signed URL
      const bucket = env.THREADS_BUCKET;
      const object = await bucket.get(file.r2Key);

      if (!object) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found in storage' });
      }

      // Return the file content as base64 for small files, or a download endpoint for large files
      if (file.size < 10 * 1024 * 1024) { // Less than 10MB
        const arrayBuffer = await object.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        return {
          type: 'base64' as const,
          data: base64,
          mimeType: file.mimeType,
          fileName: file.name,
        };
      }

      // For larger files, return download endpoint
      return {
        type: 'url' as const,
        url: `/api/drive/download/${file.id}`,
        fileName: file.name,
      };
    }),

  // Rename file
  renameFile: privateProcedure
    .input(
      z.object({
        fileId: z.string(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      await ctx.db
        .update(driveFile)
        .set({ name: input.name, updatedAt: new Date() })
        .where(
          and(
            eq(driveFile.id, input.fileId),
            eq(driveFile.userId, sessionUser.id),
          ),
        );

      return { success: true };
    }),

  // Move file to a different folder
  moveFile: privateProcedure
    .input(
      z.object({
        fileId: z.string(),
        targetFolderId: z.string().nullable(), // null = root
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      // Verify target folder exists (if not root)
      if (input.targetFolderId) {
        const targetFolder = await ctx.db.query.driveFolder.findFirst({
          where: and(
            eq(driveFolder.id, input.targetFolderId),
            eq(driveFolder.userId, sessionUser.id),
          ),
        });

        if (!targetFolder) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Target folder not found' });
        }
      }

      await ctx.db
        .update(driveFile)
        .set({ folderId: input.targetFolderId, updatedAt: new Date() })
        .where(
          and(
            eq(driveFile.id, input.fileId),
            eq(driveFile.userId, sessionUser.id),
          ),
        );

      return { success: true };
    }),

  // Toggle star on file
  toggleStar: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const file = await ctx.db.query.driveFile.findFirst({
        where: and(
          eq(driveFile.id, input.fileId),
          eq(driveFile.userId, sessionUser.id),
        ),
      });

      if (!file) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
      }

      await ctx.db
        .update(driveFile)
        .set({ isStarred: !file.isStarred, updatedAt: new Date() })
        .where(eq(driveFile.id, input.fileId));

      return { isStarred: !file.isStarred };
    }),

  // Move file to trash
  trashFile: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      await ctx.db
        .update(driveFile)
        .set({ isTrashed: true, trashedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(driveFile.id, input.fileId),
            eq(driveFile.userId, sessionUser.id),
          ),
        );

      return { success: true };
    }),

  // Restore file from trash
  restoreFile: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      await ctx.db
        .update(driveFile)
        .set({ isTrashed: false, trashedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(driveFile.id, input.fileId),
            eq(driveFile.userId, sessionUser.id),
          ),
        );

      return { success: true };
    }),

  // Permanently delete file
  deleteFile: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const file = await ctx.db.query.driveFile.findFirst({
        where: and(
          eq(driveFile.id, input.fileId),
          eq(driveFile.userId, sessionUser.id),
        ),
      });

      if (!file) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
      }

      // Delete from R2
      const bucket = env.THREADS_BUCKET;
      try {
        await bucket.delete(file.r2Key);
        if (file.thumbnailR2Key) {
          await bucket.delete(file.thumbnailR2Key);
        }
      } catch (e) {
        console.error(`Failed to delete file from R2: ${file.r2Key}`, e);
      }

      // Delete from database
      await ctx.db.delete(driveFile).where(eq(driveFile.id, input.fileId));

      return { success: true };
    }),

  // Empty trash
  emptyTrash: privateProcedure.mutation(async ({ ctx }) => {
    const { sessionUser } = ctx;

    // Get all trashed files
    const trashedFiles = await ctx.db.query.driveFile.findMany({
      where: and(
        eq(driveFile.userId, sessionUser.id),
        eq(driveFile.isTrashed, true),
      ),
    });

    // Delete from R2
    const bucket = env.THREADS_BUCKET;
    for (const file of trashedFiles) {
      try {
        await bucket.delete(file.r2Key);
        if (file.thumbnailR2Key) {
          await bucket.delete(file.thumbnailR2Key);
        }
      } catch (e) {
        console.error(`Failed to delete file from R2: ${file.r2Key}`, e);
      }
    }

    // Delete from database
    await ctx.db
      .delete(driveFile)
      .where(
        and(
          eq(driveFile.userId, sessionUser.id),
          eq(driveFile.isTrashed, true),
        ),
      );

    return { deletedCount: trashedFiles.length };
  }),

  // Get storage usage stats
  getStorageStats: privateProcedure.query(async ({ ctx }) => {
    const { sessionUser } = ctx;

    const files = await ctx.db.query.driveFile.findMany({
      where: and(
        eq(driveFile.userId, sessionUser.id),
        eq(driveFile.isTrashed, false),
      ),
      columns: {
        size: true,
        mimeType: true,
      },
    });

    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    const totalFiles = files.length;

    // Group by category
    const byCategory: Record<string, { count: number; size: number }> = {};
    for (const file of files) {
      const category = getMimeCategory(file.mimeType);
      if (!byCategory[category]) {
        byCategory[category] = { count: 0, size: 0 };
      }
      byCategory[category].count++;
      byCategory[category].size += file.size;
    }

    return {
      totalSize,
      totalFiles,
      byCategory,
    };
  }),

  // Get OnlyOffice editor config for a file
  getEditorConfig: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const file = await ctx.db.query.driveFile.findFirst({
        where: and(
          eq(driveFile.id, input.fileId),
          eq(driveFile.userId, sessionUser.id),
        ),
      });

      if (!file) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
      }

      if (!isEditableInOnlyOffice(file.mimeType, file.name)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'File type not supported for editing' });
      }

      const ext = getFileExtension(file.name);
      const documentType = ['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)
        ? 'word'
        : ['xls', 'xlsx', 'ods', 'csv'].includes(ext)
          ? 'cell'
          : ['ppt', 'pptx', 'odp'].includes(ext)
            ? 'slide'
            : 'word'; // default to word for PDF etc

      // Generate unique key for this editing session
      const documentKey = `${file.id}-${file.updatedAt.getTime()}`;

      // OnlyOffice Document Server configuration
      const config = {
        document: {
          fileType: ext,
          key: documentKey,
          title: file.name,
          url: `${env.VITE_PUBLIC_BACKEND_URL}/api/drive/file/${file.id}/content`,
        },
        documentType,
        editorConfig: {
          callbackUrl: `${env.VITE_PUBLIC_BACKEND_URL}/api/onlyoffice/callback`,
          user: {
            id: sessionUser.id,
            name: sessionUser.name || sessionUser.email,
          },
          customization: {
            autosave: true,
            forcesave: true,
          },
        },
      };

      return {
        config,
        onlyOfficeUrl: env.ONLYOFFICE_URL || 'http://157.180.65.242',
      };
    }),

  // Get import job status
  getImportJob: privateProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const job = await ctx.db.query.driveImportJob.findFirst({
        where: and(
          eq(driveImportJob.id, input.jobId),
          eq(driveImportJob.userId, sessionUser.id),
        ),
      });

      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Import job not found' });
      }

      return job;
    }),

  // List recent import jobs
  listImportJobs: privateProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;

      const jobs = await ctx.db
        .select()
        .from(driveImportJob)
        .where(eq(driveImportJob.userId, sessionUser.id))
        .orderBy(desc(driveImportJob.createdAt))
        .limit(input.limit);

      return jobs;
    }),
});
