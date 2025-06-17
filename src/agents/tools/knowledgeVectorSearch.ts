import { z } from 'zod';
import { supabase } from '../../db/supabaseClient';
import config from '../../config';

// Define the schema for knowledge vector search parameters
export const KnowledgeVectorSearchParamsSchema = z.object({
  query: z.string().describe("The search query to find relevant knowledge"),
  companyProfileId: z.string().describe("Company profile ID to search within"),
  prospectIndustry: z.string().optional().describe("Prospect's industry to filter relevant content"),
  prospectContext: z.string().optional().describe("Additional context about the prospect"),
  contentTypes: z.array(z.string()).optional().describe("Filter by content types (whitepaper, case_study, etc.)"),
  limit: z.number().optional().describe("Maximum number of results to return")
});

export type KnowledgeVectorSearchParams = z.infer<typeof KnowledgeVectorSearchParamsSchema>;

/**
 * Knowledge search result structure
 */
export interface KnowledgeSearchResult {
  id: string;
  title: string;
  contentType: string;
  relevantExcerpt: string;
  topics: string[];
  industryRelevance: string[];
  fileUrl?: string;
  relevanceScore: number;
}

/**
 * Combined knowledge search result
 */
export interface KnowledgeRetrievalResult {
  relevantKnowledge: KnowledgeSearchResult[];
  searchQuery: string;
  totalResults: number;
  searchInsights: {
    industryMatches: number;
    contentTypeDistribution: Record<string, number>;
    topTopics: string[];
    suggestedUsage: string[];
  };
}

/**
 * Search knowledge base using semantic similarity and context
 */
export async function searchKnowledgeBase(params: KnowledgeVectorSearchParams): Promise<KnowledgeRetrievalResult> {
  const { query, companyProfileId, prospectIndustry, prospectContext, contentTypes, limit = 5 } = params;
  
  console.log(`[knowledgeVectorSearch] Searching knowledge base for: "${query}" (company: ${companyProfileId})`);

  try {
    // 1. Generate embedding for the search query
    const queryEmbedding = await generateQueryEmbedding(query);
    
    // 2. Build search query with filters
    let searchQuery = supabase
      .from('knowledge_assets')
      .select('*')
      .eq('company_profile_id', companyProfileId)
      .eq('is_active', true);

    // Add industry filter if provided
    if (prospectIndustry) {
      searchQuery = searchQuery.contains('industry_relevance', [prospectIndustry]);
    }

    // Add content type filter if provided
    if (contentTypes && contentTypes.length > 0) {
      searchQuery = searchQuery.in('content_type', contentTypes);
    }

    const { data: knowledgeAssets, error } = await searchQuery.limit(20); // Get more for better ranking

    if (error) {
      throw error;
    }

    if (!knowledgeAssets || knowledgeAssets.length === 0) {
      console.log(`[knowledgeVectorSearch] No knowledge assets found for company: ${companyProfileId}`);
      return getEmptySearchResult(query);
    }

    // 3. For now, use text-based similarity until vector search is fully implemented
    const searchResults = await rankKnowledgeByRelevance(
      knowledgeAssets,
      query,
      prospectIndustry,
      prospectContext
    );

    // 4. Take top results
    const topResults = searchResults.slice(0, limit);

    // 5. Generate search insights
    const insights = generateSearchInsights(searchResults, prospectIndustry);

    console.log(`[knowledgeVectorSearch] Found ${topResults.length} relevant knowledge items`);

    return {
      relevantKnowledge: topResults,
      searchQuery: query,
      totalResults: searchResults.length,
      searchInsights: insights
    };

  } catch (error) {
    console.error(`[knowledgeVectorSearch] Error searching knowledge base:`, error);
    throw new Error(`Knowledge search failed: ${(error as Error).message}`);
  }
}

/**
 * Generate embedding for search query
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embeddings API failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0]?.embedding || [];

  } catch (error) {
    console.error(`[knowledgeVectorSearch] Error generating query embedding:`, error);
    return [];
  }
}

/**
 * Rank knowledge assets by relevance using text similarity and context
 */
async function rankKnowledgeByRelevance(
  assets: any[],
  query: string,
  prospectIndustry?: string,
  prospectContext?: string
): Promise<KnowledgeSearchResult[]> {
  const queryLower = query.toLowerCase();
  const contextLower = (prospectContext || '').toLowerCase();
  
  const rankedResults = assets.map(asset => {
    let relevanceScore = 0;
    
    // Text similarity scoring
    const contentLower = (asset.content_text || '').toLowerCase();
    const titleLower = (asset.title || '').toLowerCase();
    
    // Title match (high weight)
    if (titleLower.includes(queryLower)) {
      relevanceScore += 50;
    }
    
    // Content keyword matching
    const queryWords = queryLower.split(/\s+/);
    const matchingWords = queryWords.filter(word => 
      contentLower.includes(word) || titleLower.includes(word)
    );
    relevanceScore += (matchingWords.length / queryWords.length) * 30;
    
    // Industry relevance boost
    if (prospectIndustry && asset.industry_relevance?.includes(prospectIndustry)) {
      relevanceScore += 25;
    }
    
    // Context matching
    if (prospectContext) {
      const contextWords = contextLower.split(/\s+/);
      const contextMatches = contextWords.filter(word => contentLower.includes(word));
      relevanceScore += (contextMatches.length / contextWords.length) * 15;
    }
    
    // Content type preference (case studies and whitepapers are more valuable)
    if (asset.content_type === 'case_study') {
      relevanceScore += 10;
    } else if (asset.content_type === 'whitepaper') {
      relevanceScore += 8;
    }
    
    // Extract relevant excerpt
    const excerpt = extractRelevantExcerpt(asset.content_text, query);
    
    return {
      id: asset.id,
      title: asset.title,
      contentType: asset.content_type,
      relevantExcerpt: excerpt,
      topics: asset.topics || [],
      industryRelevance: asset.industry_relevance || [],
      fileUrl: asset.file_url,
      relevanceScore: Math.round(relevanceScore)
    };
  });
  
  // Sort by relevance score (highest first)
  return rankedResults
    .filter(result => result.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Extract relevant excerpt from content based on query
 */
function extractRelevantExcerpt(content: string, query: string, maxLength: number = 300): string {
  if (!content) return '';
  
  const queryWords = query.toLowerCase().split(/\s+/);
  const sentences = content.split(/[.!?]+/);
  
  // Find sentences containing query words
  const relevantSentences = sentences.filter(sentence => {
    const sentenceLower = sentence.toLowerCase();
    return queryWords.some(word => sentenceLower.includes(word));
  });
  
  if (relevantSentences.length === 0) {
    // Fallback to first part of content
    return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
  }
  
  // Take first relevant sentence or combine until max length
  let excerpt = relevantSentences[0].trim();
  if (excerpt.length > maxLength) {
    excerpt = excerpt.substring(0, maxLength) + '...';
  }
  
  return excerpt;
}

/**
 * Generate insights about search results
 */
function generateSearchInsights(
  results: KnowledgeSearchResult[],
  prospectIndustry?: string
): KnowledgeRetrievalResult['searchInsights'] {
  const contentTypeDistribution: Record<string, number> = {};
  const allTopics: string[] = [];
  let industryMatches = 0;
  
  results.forEach(result => {
    // Count content types
    contentTypeDistribution[result.contentType] = 
      (contentTypeDistribution[result.contentType] || 0) + 1;
    
    // Collect topics
    allTopics.push(...result.topics);
    
    // Count industry matches
    if (prospectIndustry && result.industryRelevance.includes(prospectIndustry)) {
      industryMatches++;
    }
  });
  
  // Get top topics (most frequent)
  const topicCounts = allTopics.reduce((acc, topic) => {
    acc[topic] = (acc[topic] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topTopics = Object.entries(topicCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([topic]) => topic);
  
  // Generate usage suggestions
  const suggestedUsage: string[] = [];
  if (contentTypeDistribution.case_study > 0) {
    suggestedUsage.push('Reference relevant case studies to demonstrate proven success');
  }
  if (contentTypeDistribution.whitepaper > 0) {
    suggestedUsage.push('Cite whitepapers to establish thought leadership');
  }
  if (industryMatches > 0) {
    suggestedUsage.push('Highlight industry-specific expertise and experience');
  }
  if (topTopics.length > 0) {
    suggestedUsage.push(`Emphasize expertise in: ${topTopics.slice(0, 3).join(', ')}`);
  }
  
  return {
    industryMatches,
    contentTypeDistribution,
    topTopics,
    suggestedUsage
  };
}

/**
 * Return empty search result
 */
function getEmptySearchResult(query: string): KnowledgeRetrievalResult {
  return {
    relevantKnowledge: [],
    searchQuery: query,
    totalResults: 0,
    searchInsights: {
      industryMatches: 0,
      contentTypeDistribution: {},
      topTopics: [],
      suggestedUsage: ['Add knowledge assets to improve email personalization']
    }
  };
}

/**
 * Extract key talking points from knowledge search results
 */
export function extractTalkingPoints(searchResults: KnowledgeRetrievalResult): string[] {
  const talkingPoints: string[] = [];
  
  searchResults.relevantKnowledge.forEach(knowledge => {
    // Add content-specific talking points
    if (knowledge.contentType === 'case_study') {
      talkingPoints.push(`Reference successful ${knowledge.industryRelevance.join('/')} case study: "${knowledge.title}"`);
    } else if (knowledge.contentType === 'whitepaper') {
      talkingPoints.push(`Cite thought leadership: "${knowledge.title}"`);
    } else {
      talkingPoints.push(`Leverage expertise from: "${knowledge.title}"`);
    }
  });
  
  // Add insight-based talking points
  searchResults.searchInsights.suggestedUsage.forEach(suggestion => {
    talkingPoints.push(suggestion);
  });
  
  return talkingPoints.slice(0, 5); // Limit to top 5
}