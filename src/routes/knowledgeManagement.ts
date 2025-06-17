import { Router, Request, Response } from 'express';
import multer from 'multer';
import { supabase } from '../db/supabaseClient';
import { extractTextFromPDF, generateEmbeddings, categorizeContent } from '../services/pdfProcessor';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * @swagger
 * /knowledge/upload:
 *   post:
 *     summary: Upload and process PDF for RAG knowledge base
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: pdf
 *         type: file
 *         required: true
 *         description: PDF file to upload and process
 *       - in: formData
 *         name: companyProfileId
 *         type: string
 *         required: true
 *         description: Company profile ID to associate with this knowledge
 *       - in: formData
 *         name: title
 *         type: string
 *         description: Custom title for the knowledge asset
 *       - in: formData
 *         name: description
 *         type: string
 *         description: Description of the document
 *     responses:
 *       200:
 *         description: PDF processed and stored successfully
 *       400:
 *         description: Invalid file or missing parameters
 *       500:
 *         description: Processing error
 */
router.post('/upload', upload.single('pdf'), async (req: Request, res: Response) => {
  const file = req.file;
  const { companyProfileId, title, description } = req.body;

  if (!file) {
    return res.status(400).json({
      error: 'No PDF file provided'
    });
  }

  if (!companyProfileId) {
    return res.status(400).json({
      error: 'Company profile ID is required'
    });
  }

  try {
    console.log(`[knowledgeManagement] Processing PDF upload: ${file.originalname}`);

    // 1. Extract text from PDF
    const processingResult = await extractTextFromPDF(file.buffer, file.originalname);
    
    // 2. Generate embeddings for text chunks
    const chunksWithEmbeddings = await generateEmbeddings(processingResult.chunks);
    
    // 3. Categorize content
    const categorization = categorizeContent(processingResult.text, file.originalname);
    
    // 4. Upload PDF file to Supabase Storage
    const fileName = `${Date.now()}_${file.originalname}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('knowledge-assets')
      .upload(fileName, file.buffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`File upload failed: ${uploadError.message}`);
    }

    // 5. Get public URL for the uploaded file
    const { data: { publicUrl } } = supabase.storage
      .from('knowledge-assets')
      .getPublicUrl(fileName);

    // 6. Store knowledge asset metadata
    const { data: knowledgeAsset, error: assetError } = await supabase
      .from('knowledge_assets')
      .insert({
        company_profile_id: companyProfileId,
        title: title || processingResult.metadata.title || file.originalname,
        content_type: categorization.contentType,
        content_text: processingResult.text,
        file_url: publicUrl,
        topics: categorization.topics,
        target_audience: categorization.targetAudience,
        industry_relevance: categorization.industryRelevance,
      })
      .select()
      .single();

    if (assetError) {
      throw new Error(`Failed to store knowledge asset: ${assetError.message}`);
    }

    // 7. Store individual chunks with embeddings
    const chunkInserts = chunksWithEmbeddings.map(chunk => ({
      knowledge_asset_id: knowledgeAsset.id,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      embedding: JSON.stringify(chunk.embedding), // Store as JSON for now
      word_count: chunk.wordCount
    }));

    // For now, we'll store chunks in a separate table (to be created)
    // In production, you might want to use Supabase's vector extensions

    console.log(`[knowledgeManagement] Successfully processed PDF: ${file.originalname}`);
    
    res.json({
      success: true,
      knowledgeAsset: {
        id: knowledgeAsset.id,
        title: knowledgeAsset.title,
        contentType: knowledgeAsset.content_type,
        fileUrl: knowledgeAsset.file_url,
        topics: knowledgeAsset.topics,
        targetAudience: knowledgeAsset.target_audience,
        industryRelevance: knowledgeAsset.industry_relevance,
        metadata: processingResult.metadata,
        chunksProcessed: chunksWithEmbeddings.length
      }
    });

  } catch (error) {
    console.error('[knowledgeManagement] Error processing PDF upload:', error);
    res.status(500).json({
      error: 'Failed to process PDF',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /knowledge/search:
 *   post:
 *     summary: Search knowledge base using semantic similarity
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query text
 *               companyProfileId:
 *                 type: string
 *                 description: Company profile ID to search within
 *               industry:
 *                 type: string
 *                 description: Filter by industry relevance
 *               contentType:
 *                 type: string
 *                 description: Filter by content type
 *               limit:
 *                 type: integer
 *                 description: Maximum number of results to return
 *             required:
 *               - query
 *     responses:
 *       200:
 *         description: Search results returned successfully
 */
router.post('/search', async (req: Request, res: Response) => {
  const { query, companyProfileId, industry, contentType, limit = 5 } = req.body;

  if (!query) {
    return res.status(400).json({
      error: 'Search query is required'
    });
  }

  try {
    console.log(`[knowledgeManagement] Searching knowledge base for: "${query}"`);

    // TODO: Implement vector similarity search
    // For now, we'll do a simple text search
    
    let searchQuery = supabase
      .from('knowledge_assets')
      .select('*')
      .textSearch('content_text', query);

    if (companyProfileId) {
      searchQuery = searchQuery.eq('company_profile_id', companyProfileId);
    }

    if (industry) {
      searchQuery = searchQuery.contains('industry_relevance', [industry]);
    }

    if (contentType) {
      searchQuery = searchQuery.eq('content_type', contentType);
    }

    const { data: results, error } = await searchQuery
      .eq('is_active', true)
      .limit(limit);

    if (error) {
      throw error;
    }

    console.log(`[knowledgeManagement] Found ${results?.length || 0} results for query: "${query}"`);

    res.json({
      success: true,
      results: results || [],
      query,
      filters: { companyProfileId, industry, contentType },
      count: results?.length || 0
    });

  } catch (error) {
    console.error('[knowledgeManagement] Error searching knowledge base:', error);
    res.status(500).json({
      error: 'Failed to search knowledge base',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /knowledge/assets:
 *   get:
 *     summary: List all knowledge assets for a company
 */
router.get('/assets', async (req: Request, res: Response) => {
  const { companyProfileId, contentType, topic } = req.query;

  try {
    let query = supabase
      .from('knowledge_assets')
      .select('*')
      .eq('is_active', true);

    if (companyProfileId) {
      query = query.eq('company_profile_id', companyProfileId);
    }

    if (contentType) {
      query = query.eq('content_type', contentType);
    }

    if (topic) {
      query = query.contains('topics', [topic]);
    }

    const { data: assets, error } = await query
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      assets: assets || [],
      count: assets?.length || 0
    });

  } catch (error) {
    console.error('[knowledgeManagement] Error retrieving knowledge assets:', error);
    res.status(500).json({
      error: 'Failed to retrieve knowledge assets',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /knowledge/assets/{id}:
 *   delete:
 *     summary: Delete a knowledge asset
 */
router.delete('/assets/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Soft delete by setting is_active to false
    const { data, error } = await supabase
      .from('knowledge_assets')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        error: 'Knowledge asset not found'
      });
    }

    console.log(`[knowledgeManagement] Deleted knowledge asset: ${data.title}`);

    res.json({
      success: true,
      message: 'Knowledge asset deleted successfully',
      asset: data
    });

  } catch (error) {
    console.error('[knowledgeManagement] Error deleting knowledge asset:', error);
    res.status(500).json({
      error: 'Failed to delete knowledge asset',
      details: (error as Error).message
    });
  }
});

export default router;