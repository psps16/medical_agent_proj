import React from 'react';
import './FeaturesSection.css';

// Define an interface for the feature props
interface FeatureProps {
  iconClass: string;
  bgColorClass: string;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureProps> = ({ iconClass, bgColorClass, title, description }) => {
  return (
    <div className="feature-card bg-white p-6">
      <div className={`${bgColorClass} w-16 h-16 flex items-center justify-center rounded-full mb-6`}>
        <i className={`${iconClass} text-3xl`}></i>
      </div>
      <h3 className="text-2xl font-bold mb-3">{title}</h3>
      <p className="mb-4">{description}</p>
    </div>
  );
};

const FeaturesSection: React.FC = () => {
  const features: FeatureProps[] = [
    {
      iconClass: 'fas fa-comment-medical text-blue-500',
      bgColorClass: 'bg-blue-100',
      title: '24/7 Patient Support',
      description: 'Round-the-clock virtual assistance for patient questions, symptom assessment, and care guidance.',
    },
    {
      iconClass: 'fas fa-calendar-check text-yellow-600',
      bgColorClass: 'bg-yellow-100',
      title: 'Smart Scheduling',
      description: 'Automated appointment booking, reminders, and intelligent priority-based scheduling.',
    },
    {
      iconClass: 'fas fa-notes-medical text-green-600',
      bgColorClass: 'bg-green-100',
      title: 'Medical Records Access',
      description: 'Secure, HIPAA-compliant access to patient records, test results, and medical history.',
    },
    {
      iconClass: 'fas fa-pills text-red-600',
      bgColorClass: 'bg-red-100',
      title: 'Medication Management',
      description: 'Medication reminders, refill notifications, and potential interaction warnings.',
    },
    {
      iconClass: 'fas fa-user-md text-purple-600',
      bgColorClass: 'bg-purple-100',
      title: 'Doctor Assistance',
      description: 'Clinical decision support, documentation automation, and resource optimization.',
    },
    {
      iconClass: 'fas fa-shield-alt text-indigo-600',
      bgColorClass: 'bg-indigo-100',
      title: 'HIPAA Compliant',
      description: 'End-to-end encryption and rigorous security protocols to protect sensitive health data.',
    },
  ];

  return (
    <section id="features" className="px-6 md:px-12 py-20 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1 bg-yellow-400 neo-border mb-4">FEATURES</span>
          <h2 className="text-5xl font-bold mb-6">Powerful <span className="text-blue-500">AI</span> for Healthcare</h2>
          <p className="text-xl max-w-3xl mx-auto">Our medical agent combines cutting-edge AI with healthcare expertise to provide seamless support for both patients and healthcare providers.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;