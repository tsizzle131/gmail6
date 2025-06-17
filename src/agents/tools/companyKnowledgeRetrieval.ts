import { z } from 'zod';
import { supabase } from '../../db/supabaseClient';

// Define the schema for company knowledge retrieval parameters
export const CompanyKnowledgeParamsSchema = z.object({
  companyName: z.string().describe("The sender's company name to retrieve knowledge for"),
  prospectIndustry: z.string().optional().describe("The prospect's industry to find relevant case studies"),
  prospectSize: z.string().optional().describe("The prospect's company size to find similar clients"),
  serviceCategory: z.string().optional().describe("Specific service category to focus on"),
  includeTeamCredentials: z.boolean().optional().describe("Whether to include team credentials in response")
});

export type CompanyKnowledgeParams = z.infer<typeof CompanyKnowledgeParamsSchema>;

/**
 * Company knowledge structure for email personalization
 */
export interface CompanyKnowledgeResult {
  companyProfile: {
    name: string;
    tagline?: string;
    description: string;
    primaryValueProposition: string;
    competitiveAdvantages: string[];
    targetMarkets: string[];
    industrySpecializations: string[];
    websiteUrl?: string;
  };
  relevantServices: Array<{
    name: string;
    category: string;
    shortDescription: string;
    keyBenefits: string[];
    uniqueApproach?: string;
    technologiesUsed: string[];
  }>;
  relevantCaseStudies: Array<{
    title: string;
    clientIndustry: string;
    clientSize?: string;
    challenge: string;
    solution: string;
    results: string[];
    testimonial?: string;
  }>;
  teamCredentials?: Array<{
    name: string;
    title: string;
    expertiseAreas: string[];
    yearsExperience?: number;
  }>;
  personalizationInsights: {
    industryExperience: string[];
    similarClientSuccess: string[];
    relevantDifferentiators: string[];
    suggestedApproach: string;
  };
}

/**
 * Retrieve comprehensive company knowledge for email personalization
 */
export async function retrieveCompanyKnowledge(params: CompanyKnowledgeParams): Promise<CompanyKnowledgeResult> {
  const { companyName, prospectIndustry, prospectSize, serviceCategory, includeTeamCredentials } = params;
  
  console.log(`[companyKnowledgeRetrieval] Retrieving knowledge for ${companyName}, prospect: ${prospectIndustry || 'any industry'}`);

  try {
    // 1. Get company profile
    const { data: companyProfile, error: profileError } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('company_name', companyName)
      .eq('is_active', true)
      .single();

    if (profileError || !companyProfile) {
      console.warn(`[companyKnowledgeRetrieval] No company profile found for: ${companyName}`);
      return getMinimalCompanyKnowledge(companyName);
    }

    // 2. Get relevant services
    let servicesQuery = supabase
      .from('company_services')
      .select('*')
      .eq('company_profile_id', companyProfile.id)
      .eq('is_active', true);

    if (serviceCategory) {
      servicesQuery = servicesQuery.eq('service_category', serviceCategory);
    }

    const { data: services, error: servicesError } = await servicesQuery
      .order('is_primary_service', { ascending: false })
      .order('display_order', { ascending: true })
      .limit(5);

    // 3. Get relevant case studies
    let caseStudiesQuery = supabase
      .from('case_studies')
      .select('*')
      .eq('company_profile_id', companyProfile.id)
      .eq('can_use_publicly', true);

    if (prospectIndustry) {
      // First try exact match, then fallback to all
      const { data: industrySpecificCases } = await caseStudiesQuery
        .eq('client_industry', prospectIndustry)
        .order('is_featured', { ascending: false })
        .limit(3);

      if (industrySpecificCases && industrySpecificCases.length > 0) {
        caseStudiesQuery = supabase
          .from('case_studies')
          .select('*')
          .eq('company_profile_id', companyProfile.id)
          .eq('can_use_publicly', true)
          .eq('client_industry', prospectIndustry);
      }
    }

    const { data: caseStudies } = await caseStudiesQuery
      .order('is_featured', { ascending: false })
      .order('completion_date', { ascending: false })
      .limit(3);

    // 4. Get team credentials (if requested)
    let teamCredentials = null;
    if (includeTeamCredentials) {
      const { data: team } = await supabase
        .from('team_credentials')
        .select('*')
        .eq('company_profile_id', companyProfile.id)
        .eq('can_use_in_proposals', true)
        .order('years_experience', { ascending: false })
        .limit(3);
      
      teamCredentials = team;
    }

    // 5. Generate personalization insights
    const insights = generatePersonalizationInsights(
      companyProfile,
      services || [],
      caseStudies || [],
      prospectIndustry,
      prospectSize
    );

    const result: CompanyKnowledgeResult = {
      companyProfile: {
        name: companyProfile.company_name,
        tagline: companyProfile.tagline,
        description: companyProfile.description,
        primaryValueProposition: companyProfile.primary_value_proposition,
        competitiveAdvantages: companyProfile.competitive_advantages || [],
        targetMarkets: companyProfile.target_markets || [],
        industrySpecializations: companyProfile.industry_specializations || [],
        websiteUrl: companyProfile.website_url,
      },
      relevantServices: (services || []).map(service => ({
        name: service.service_name,
        category: service.service_category,
        shortDescription: service.short_description,
        keyBenefits: service.key_benefits || [],
        uniqueApproach: service.unique_approach,
        technologiesUsed: service.technologies_used || [],
      })),
      relevantCaseStudies: (caseStudies || []).map(caseStudy => ({
        title: caseStudy.title,
        clientIndustry: caseStudy.client_industry,
        clientSize: caseStudy.client_size,
        challenge: caseStudy.client_challenge,
        solution: caseStudy.solution_provided,
        results: [...(caseStudy.quantitative_results || []), ...(caseStudy.qualitative_results || [])],
        testimonial: caseStudy.client_testimonial,
      })),
      teamCredentials: teamCredentials?.map(member => ({
        name: member.name,
        title: member.title,
        expertiseAreas: member.expertise_areas || [],
        yearsExperience: member.years_experience,
      })),
      personalizationInsights: insights,
    };

    console.log(`[companyKnowledgeRetrieval] Retrieved knowledge for ${companyName}:`);
    console.log(`  - Services: ${result.relevantServices.length}`);
    console.log(`  - Case Studies: ${result.relevantCaseStudies.length}`);
    console.log(`  - Industry Match: ${insights.industryExperience.length > 0 ? 'Yes' : 'No'}`);

    return result;

  } catch (error) {
    console.error(`[companyKnowledgeRetrieval] Error retrieving company knowledge:`, error);
    return getMinimalCompanyKnowledge(companyName);
  }
}

/**
 * Generate personalization insights based on company knowledge and prospect info
 */
function generatePersonalizationInsights(
  companyProfile: any,
  services: any[],
  caseStudies: any[],
  prospectIndustry?: string,
  prospectSize?: string
): CompanyKnowledgeResult['personalizationInsights'] {
  
  const industryExperience: string[] = [];
  const similarClientSuccess: string[] = [];
  const relevantDifferentiators: string[] = [];
  
  // Check industry experience
  if (prospectIndustry) {
    const industrySpecializations = companyProfile.industry_specializations || [];
    if (industrySpecializations.includes(prospectIndustry)) {
      industryExperience.push(`Specialized expertise in ${prospectIndustry} industry`);
    }
    
    // Check case studies for industry experience
    const industryCases = caseStudies.filter(cs => cs.client_industry === prospectIndustry);
    if (industryCases.length > 0) {
      industryExperience.push(`${industryCases.length} successful ${prospectIndustry} client projects`);
    }
  }
  
  // Similar client success
  if (prospectSize) {
    const similarSizeCases = caseStudies.filter(cs => cs.client_size === prospectSize);
    similarSizeCases.forEach(cs => {
      const results = [...(cs.quantitative_results || []), ...(cs.qualitative_results || [])];
      if (results.length > 0) {
        similarClientSuccess.push(`${cs.client_industry} client (${cs.client_size}): ${results[0]}`);
      }
    });
  }
  
  // Relevant differentiators
  const competitiveAdvantages = companyProfile.competitive_advantages || [];
  competitiveAdvantages.forEach((advantage: string) => {
    relevantDifferentiators.push(advantage);
  });
  
  // Suggest approach based on available data
  let suggestedApproach = 'value_proposition';
  if (caseStudies.length > 0 && (industryExperience.length > 0 || similarClientSuccess.length > 0)) {
    suggestedApproach = 'case_study';
  } else if (industryExperience.length > 0) {
    suggestedApproach = 'industry_trend';
  } else if (competitiveAdvantages.length > 0) {
    suggestedApproach = 'value_proposition';
  }
  
  return {
    industryExperience,
    similarClientSuccess,
    relevantDifferentiators,
    suggestedApproach
  };
}

/**
 * Fallback for when no company knowledge is found
 */
function getMinimalCompanyKnowledge(companyName: string): CompanyKnowledgeResult {
  return {
    companyProfile: {
      name: companyName,
      description: `${companyName} provides professional consulting and technology solutions.`,
      primaryValueProposition: 'Delivering innovative solutions to help businesses achieve their goals.',
      competitiveAdvantages: ['Experienced team', 'Proven methodology', 'Client-focused approach'],
      targetMarkets: ['Enterprise', 'Mid-Market'],
      industrySpecializations: [],
    },
    relevantServices: [],
    relevantCaseStudies: [],
    personalizationInsights: {
      industryExperience: [],
      similarClientSuccess: [],
      relevantDifferentiators: ['Experienced team', 'Proven methodology'],
      suggestedApproach: 'consultative'
    }
  };
}

/**
 * Score and rank company knowledge relevance to prospect
 */
export function scoreKnowledgeRelevance(
  knowledge: CompanyKnowledgeResult,
  prospectIndustry?: string,
  prospectSize?: string
): number {
  let score = 0;
  
  // Industry match scoring
  if (prospectIndustry) {
    if (knowledge.companyProfile.industrySpecializations.includes(prospectIndustry)) {
      score += 30;
    }
    
    const industryMatches = knowledge.relevantCaseStudies.filter(cs => cs.clientIndustry === prospectIndustry);
    score += industryMatches.length * 15; // Up to 45 points for 3 industry cases
  }
  
  // Size match scoring
  if (prospectSize) {
    const sizeMatches = knowledge.relevantCaseStudies.filter(cs => cs.clientSize === prospectSize);
    score += sizeMatches.length * 10; // Up to 30 points for 3 size matches
  }
  
  // General completeness scoring
  score += Math.min(knowledge.relevantServices.length * 5, 25); // Up to 25 points for services
  score += Math.min(knowledge.relevantCaseStudies.length * 8, 24); // Up to 24 points for case studies
  
  return Math.min(score, 100); // Cap at 100
}