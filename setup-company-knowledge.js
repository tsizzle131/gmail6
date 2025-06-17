// Setup script to create company knowledge tables and test data
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupCompanyKnowledge() {
  console.log('🚀 Setting up company knowledge system...');
  
  try {
    // 1. Test if tables already exist by trying to insert a company profile
    console.log('1. Creating TechSolutions Pro company profile...');
    
    const { data: profile, error: profileError } = await supabase
      .from('company_profiles')
      .insert({
        company_name: 'TechSolutions Pro',
        tagline: 'AI Implementation Experts',
        description: 'We help companies successfully implement AI solutions that drive real business value. Our team of AI specialists has 15+ years of experience helping Fortune 500 companies and fast-growing startups alike.',
        founded_year: 2018,
        employee_count_range: '25-50',
        headquarters_location: 'San Francisco, CA',
        website_url: 'https://techsolutionspro.com',
        primary_value_proposition: 'Proven AI implementation methodology that reduces time-to-value by 60% while ensuring scalable, production-ready solutions.',
        secondary_value_propositions: [
          'End-to-end AI strategy and implementation',
          'Proven track record with 200+ successful AI deployments',
          'Expert team with backgrounds from Google, Microsoft, and OpenAI'
        ],
        competitive_advantages: [
          'Proprietary AI readiness assessment framework',
          'Industry-specific AI solution templates',
          'Post-deployment optimization and monitoring',
          'Dedicated AI ethics and governance consulting'
        ],
        target_markets: ['Enterprise', 'Mid-Market', 'Healthcare', 'Financial Services'],
        industry_specializations: ['Healthcare', 'Finance', 'Manufacturing', 'Retail', 'AI consulting'],
        company_values: ['Innovation', 'Transparency', 'Client Success', 'Ethical AI'],
        mission_statement: 'To democratize AI by making enterprise-grade AI solutions accessible and successful for companies of all sizes.',
        primary_contact_email: 'hello@techsolutionspro.com',
        primary_contact_phone: '(555) 123-4567',
        linkedin_url: 'https://linkedin.com/company/techsolutionspro'
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Error creating company profile:', profileError);
      console.log('Tables may not exist yet. Please run the migration manually in Supabase dashboard.');
      return;
    }

    console.log('✅ Company profile created:', profile.company_name);

    // 2. Add services
    console.log('2. Adding company services...');
    
    const services = [
      {
        company_profile_id: profile.id,
        service_name: 'AI Strategy & Roadmap Development',
        service_category: 'Strategy',
        short_description: 'Comprehensive AI strategy development tailored to your business goals and technical capabilities.',
        detailed_description: 'Our AI Strategy & Roadmap Development service helps organizations create a clear path for AI adoption. We assess your current state, identify opportunities, and create a phased implementation plan that maximizes ROI while minimizing risk.',
        key_benefits: [
          'Clear AI adoption roadmap with prioritized initiatives',
          'Risk assessment and mitigation strategies',
          'ROI projections and success metrics',
          'Technology stack recommendations'
        ],
        target_audience: 'CTOs, CDOs, Innovation Directors',
        typical_project_duration: '4-8 weeks',
        price_range: '$25k-75k',
        unique_approach: 'Our proprietary AI Readiness Assessment Framework evaluates 47 key factors across technology, data, processes, and culture.',
        technologies_used: ['Python', 'TensorFlow', 'PyTorch', 'MLflow', 'Kubernetes'],
        methodologies: ['Design Thinking', 'Agile', 'DevOps', 'MLOps'],
        is_primary_service: true
      },
      {
        company_profile_id: profile.id,
        service_name: 'Custom AI Model Development',
        service_category: 'Development',
        short_description: 'End-to-end custom AI model development from concept to production deployment.',
        detailed_description: 'We build custom AI models tailored to your specific use cases, from computer vision and NLP to predictive analytics and recommendation systems.',
        key_benefits: [
          'Models optimized for your specific data and use cases',
          'Production-ready deployment with monitoring',
          'Continuous model improvement and retraining',
          'Full documentation and knowledge transfer'
        ],
        target_audience: 'Data Scientists, Engineering Teams, Product Managers',
        typical_project_duration: '8-16 weeks',
        price_range: '$50k-200k',
        unique_approach: 'We use a hybrid approach combining cutting-edge research with battle-tested production practices.',
        technologies_used: ['Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'Docker', 'AWS', 'GCP'],
        methodologies: ['MLOps', 'CI/CD', 'A/B Testing', 'Model Monitoring'],
        is_primary_service: true
      }
    ];

    for (const service of services) {
      const { data: serviceData, error: serviceError } = await supabase
        .from('company_services')
        .insert(service)
        .select()
        .single();

      if (serviceError) {
        console.error('❌ Error adding service:', serviceError);
      } else {
        console.log('✅ Service added:', serviceData.service_name);
      }
    }

    // 3. Add case studies
    console.log('3. Adding case studies...');
    
    const caseStudies = [
      {
        company_profile_id: profile.id,
        title: 'Fortune 500 Healthcare Provider Reduces Diagnostic Time by 40%',
        client_name: 'Major Healthcare Provider',
        client_industry: 'Healthcare',
        client_size: '500+ employees',
        client_challenge: 'Manual radiology image analysis was creating bottlenecks in patient diagnosis, leading to delayed treatments and reduced patient satisfaction.',
        solution_provided: 'Implemented custom computer vision AI model for automated radiology image analysis with human-in-the-loop validation.',
        implementation_approach: 'Phased rollout starting with non-critical cases, extensive radiologist training, and integration with existing PACS system.',
        quantitative_results: [
          '40% reduction in average diagnostic time',
          '25% increase in radiologist productivity',
          '99.2% accuracy rate matching senior radiologist assessments',
          '$2.3M annual cost savings'
        ],
        qualitative_results: [
          'Improved patient satisfaction scores',
          'Reduced radiologist burnout and stress',
          'Enhanced diagnostic confidence',
          'Better work-life balance for medical staff'
        ],
        timeline_duration: '12 weeks',
        technologies_used: ['TensorFlow', 'OpenCV', 'Docker', 'Kubernetes', 'AWS'],
        team_size: 6,
        client_testimonial: 'TechSolutions Pro transformed our radiology department. The AI system has become an indispensable tool that our radiologists now can\'t imagine working without.',
        testimonial_author: 'Dr. Sarah Chen',
        testimonial_author_title: 'Chief of Radiology',
        can_use_client_name: false,
        can_use_publicly: true,
        is_featured: true,
        completion_date: '2024-03-15'
      },
      {
        company_profile_id: profile.id,
        title: 'Fintech Startup Increases Fraud Detection Accuracy by 60%',
        client_name: 'FastPay Financial',
        client_industry: 'Finance',
        client_size: '50-200 employees',
        client_challenge: 'High false positive rates in fraud detection were blocking legitimate transactions, causing customer friction and revenue loss.',
        solution_provided: 'Developed advanced ML model combining transaction patterns, behavioral analytics, and real-time risk scoring.',
        implementation_approach: 'A/B testing framework with gradual rollout, extensive backtesting on historical data, and real-time monitoring dashboard.',
        quantitative_results: [
          '60% improvement in fraud detection accuracy',
          '45% reduction in false positives',
          '15% increase in approved transactions',
          '$1.8M prevented fraud losses annually'
        ],
        qualitative_results: [
          'Improved customer experience',
          'Reduced manual review workload',
          'Enhanced risk team confidence',
          'Better regulatory compliance'
        ],
        timeline_duration: '10 weeks',
        technologies_used: ['Python', 'Scikit-learn', 'Apache Kafka', 'Redis', 'PostgreSQL'],
        team_size: 4,
        client_testimonial: 'The fraud detection system from TechSolutions Pro has been a game-changer. We\'re catching more fraud while approving more legitimate transactions.',
        testimonial_author: 'Mike Rodriguez',
        testimonial_author_title: 'VP of Risk Management',
        can_use_client_name: true,
        can_use_publicly: true,
        is_featured: true,
        completion_date: '2024-01-20'
      }
    ];

    for (const caseStudy of caseStudies) {
      const { data: caseData, error: caseError } = await supabase
        .from('case_studies')
        .insert(caseStudy)
        .select()
        .single();

      if (caseError) {
        console.error('❌ Error adding case study:', caseError);
      } else {
        console.log('✅ Case study added:', caseData.title);
      }
    }

    console.log('\n🎉 Company knowledge system setup complete!');
    console.log('📊 Summary:');
    console.log(`- Company Profile: ${profile.company_name}`);
    console.log(`- Services: ${services.length}`);
    console.log(`- Case Studies: ${caseStudies.length}`);
    console.log('\n🚀 Ready to test enhanced email crafting!');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupCompanyKnowledge();