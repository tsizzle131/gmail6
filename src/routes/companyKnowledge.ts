import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabaseClient';

const router = Router();

/**
 * @swagger
 * /company/profile:
 *   post:
 *     summary: Create or update company profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *               tagline:
 *                 type: string
 *               description:
 *                 type: string
 *               primaryValueProposition:
 *                 type: string
 *               competitiveAdvantages:
 *                 type: array
 *                 items:
 *                   type: string
 *               targetMarkets:
 *                 type: array
 *                 items:
 *                   type: string
 *             required:
 *               - companyName
 *               - description
 *               - primaryValueProposition
 *     responses:
 *       200:
 *         description: Company profile created/updated successfully
 */
router.post('/profile', async (req: Request, res: Response) => {
  const {
    companyName,
    tagline,
    description,
    foundedYear,
    employeeCountRange,
    headquartersLocation,
    websiteUrl,
    primaryValueProposition,
    secondaryValuePropositions,
    competitiveAdvantages,
    targetMarkets,
    industrySpecializations,
    companyValues,
    missionStatement,
    companyCultureDescription,
    primaryContactEmail,
    primaryContactPhone,
    linkedinUrl,
    twitterUrl
  } = req.body;

  if (!companyName || !description || !primaryValueProposition) {
    return res.status(400).json({
      error: 'Missing required fields: companyName, description, primaryValueProposition'
    });
  }

  try {
    // First, check if a profile already exists
    const { data: existingProfile } = await supabase
      .from('company_profiles')
      .select('id')
      .eq('company_name', companyName)
      .single();

    let result;
    if (existingProfile) {
      // Update existing profile
      result = await supabase
        .from('company_profiles')
        .update({
          tagline,
          description,
          founded_year: foundedYear,
          employee_count_range: employeeCountRange,
          headquarters_location: headquartersLocation,
          website_url: websiteUrl,
          primary_value_proposition: primaryValueProposition,
          secondary_value_propositions: secondaryValuePropositions,
          competitive_advantages: competitiveAdvantages,
          target_markets: targetMarkets,
          industry_specializations: industrySpecializations,
          company_values: companyValues,
          mission_statement: missionStatement,
          company_culture_description: companyCultureDescription,
          primary_contact_email: primaryContactEmail,
          primary_contact_phone: primaryContactPhone,
          linkedin_url: linkedinUrl,
          twitter_url: twitterUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProfile.id)
        .select()
        .single();
    } else {
      // Create new profile
      result = await supabase
        .from('company_profiles')
        .insert({
          company_name: companyName,
          tagline,
          description,
          founded_year: foundedYear,
          employee_count_range: employeeCountRange,
          headquarters_location: headquartersLocation,
          website_url: websiteUrl,
          primary_value_proposition: primaryValueProposition,
          secondary_value_propositions: secondaryValuePropositions,
          competitive_advantages: competitiveAdvantages,
          target_markets: targetMarkets,
          industry_specializations: industrySpecializations,
          company_values: companyValues,
          mission_statement: missionStatement,
          company_culture_description: companyCultureDescription,
          primary_contact_email: primaryContactEmail,
          primary_contact_phone: primaryContactPhone,
          linkedin_url: linkedinUrl,
          twitter_url: twitterUrl
        })
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    console.log(`[companyKnowledge] Company profile ${existingProfile ? 'updated' : 'created'} for: ${companyName}`);
    res.json({
      success: true,
      action: existingProfile ? 'updated' : 'created',
      profile: result.data
    });

  } catch (error) {
    console.error('[companyKnowledge] Error managing company profile:', error);
    res.status(500).json({
      error: 'Failed to manage company profile',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /company/profile:
 *   get:
 *     summary: Get company profile
 *     parameters:
 *       - in: query
 *         name: companyName
 *         schema:
 *           type: string
 *         description: Company name to retrieve profile for
 *     responses:
 *       200:
 *         description: Company profile retrieved successfully
 */
router.get('/profile', async (req: Request, res: Response) => {
  const { companyName } = req.query;

  try {
    let query = supabase.from('company_profiles').select('*');
    
    if (companyName) {
      query = query.eq('company_name', companyName);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      profiles: data
    });

  } catch (error) {
    console.error('[companyKnowledge] Error retrieving company profile:', error);
    res.status(500).json({
      error: 'Failed to retrieve company profile',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /company/services:
 *   post:
 *     summary: Add a service/product to company profile
 */
router.post('/services', async (req: Request, res: Response) => {
  const {
    companyProfileId,
    serviceName,
    serviceCategory,
    shortDescription,
    detailedDescription,
    keyBenefits,
    targetAudience,
    typicalProjectDuration,
    priceRange,
    uniqueApproach,
    technologiesUsed,
    methodologies,
    isPrimaryService
  } = req.body;

  if (!companyProfileId || !serviceName || !shortDescription) {
    return res.status(400).json({
      error: 'Missing required fields: companyProfileId, serviceName, shortDescription'
    });
  }

  try {
    const { data, error } = await supabase
      .from('company_services')
      .insert({
        company_profile_id: companyProfileId,
        service_name: serviceName,
        service_category: serviceCategory,
        short_description: shortDescription,
        detailed_description: detailedDescription,
        key_benefits: keyBenefits,
        target_audience: targetAudience,
        typical_project_duration: typicalProjectDuration,
        price_range: priceRange,
        unique_approach: uniqueApproach,
        technologies_used: technologiesUsed,
        methodologies: methodologies,
        is_primary_service: isPrimaryService
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`[companyKnowledge] Service added: ${serviceName}`);
    res.json({
      success: true,
      service: data
    });

  } catch (error) {
    console.error('[companyKnowledge] Error adding service:', error);
    res.status(500).json({
      error: 'Failed to add service',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /company/services:
 *   get:
 *     summary: Get company services
 */
router.get('/services', async (req: Request, res: Response) => {
  const { companyProfileId } = req.query;

  try {
    let query = supabase.from('company_services').select('*').eq('is_active', true);
    
    if (companyProfileId) {
      query = query.eq('company_profile_id', companyProfileId);
    }

    const { data, error } = await query.order('display_order', { ascending: true });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      services: data
    });

  } catch (error) {
    console.error('[companyKnowledge] Error retrieving services:', error);
    res.status(500).json({
      error: 'Failed to retrieve services',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /company/case-studies:
 *   post:
 *     summary: Add a case study to company profile
 */
router.post('/case-studies', async (req: Request, res: Response) => {
  const {
    companyProfileId,
    serviceId,
    title,
    clientName,
    clientIndustry,
    clientSize,
    clientChallenge,
    solutionProvided,
    implementationApproach,
    quantitativeResults,
    qualitativeResults,
    timelineDuration,
    technologiesUsed,
    teamSize,
    clientTestimonial,
    testimonialAuthor,
    testimonialAuthorTitle,
    canUseClientName,
    canUsePublicly,
    isFeatured,
    completionDate
  } = req.body;

  if (!companyProfileId || !title || !clientChallenge || !solutionProvided) {
    return res.status(400).json({
      error: 'Missing required fields: companyProfileId, title, clientChallenge, solutionProvided'
    });
  }

  try {
    const { data, error } = await supabase
      .from('case_studies')
      .insert({
        company_profile_id: companyProfileId,
        service_id: serviceId,
        title,
        client_name: clientName,
        client_industry: clientIndustry,
        client_size: clientSize,
        client_challenge: clientChallenge,
        solution_provided: solutionProvided,
        implementation_approach: implementationApproach,
        quantitative_results: quantitativeResults,
        qualitative_results: qualitativeResults,
        timeline_duration: timelineDuration,
        technologies_used: technologiesUsed,
        team_size: teamSize,
        client_testimonial: clientTestimonial,
        testimonial_author: testimonialAuthor,
        testimonial_author_title: testimonialAuthorTitle,
        can_use_client_name: canUseClientName,
        can_use_publicly: canUsePublicly,
        is_featured: isFeatured,
        completion_date: completionDate
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`[companyKnowledge] Case study added: ${title}`);
    res.json({
      success: true,
      caseStudy: data
    });

  } catch (error) {
    console.error('[companyKnowledge] Error adding case study:', error);
    res.status(500).json({
      error: 'Failed to add case study',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /company/case-studies:
 *   get:
 *     summary: Get company case studies
 */
router.get('/case-studies', async (req: Request, res: Response) => {
  const { companyProfileId, clientIndustry, isFeatured } = req.query;

  try {
    let query = supabase.from('case_studies').select('*');
    
    if (companyProfileId) {
      query = query.eq('company_profile_id', companyProfileId);
    }
    if (clientIndustry) {
      query = query.eq('client_industry', clientIndustry);
    }
    if (isFeatured !== undefined) {
      query = query.eq('is_featured', isFeatured === 'true');
    }

    const { data, error } = await query.order('completion_date', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      caseStudies: data
    });

  } catch (error) {
    console.error('[companyKnowledge] Error retrieving case studies:', error);
    res.status(500).json({
      error: 'Failed to retrieve case studies',
      details: (error as Error).message
    });
  }
});

export default router;