import React from 'react';
import './PricingSection.css';

interface PricingPlanProps {
  title: string;
  description: string;
  price: string;
  features: string[];
}

const PricingCard: React.FC<PricingPlanProps> = ({ title, description, price, features }) => {
  return (
    <div className="pricing-card bg-white p-8">
      <h3 className="text-2xl font-bold mb-2">{title}</h3>
      <p className="text-gray-600 mb-6">{description}</p>
      <div className="flex items-baseline mb-6">
        <span className="text-5xl font-bold">{price}</span>
        <span className="text-gray-600 ml-2">/month</span>
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center">
            <i className="fas fa-check text-green-500 mr-2"></i>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <a href="#contact" className="neo-btn bg-blue-500 text-white w-full py-3 text-center block">Get Started</a>
    </div>
  );
};

const PricingSection: React.FC = () => {
  const pricingPlans: PricingPlanProps[] = [
    {
      title: 'Starter',
      description: 'For small practices',
      price: '$249',
      features: [
        'Up to 2 healthcare providers',
        '500 patient interactions/month',
        'Basic EHR integration',
        'Standard support'
      ]
    },
    {
      title: 'Professional',
      description: 'For growing practices',
      price: '$499',
      features: [
        'Up to 10 healthcare providers',
        '2,000 patient interactions/month',
        'Advanced EHR integration',
        'Priority support',
        'Custom AI training'
      ]
    },
    {
      title: 'Enterprise',
      description: 'For large organizations',
      price: 'Custom',
      features: [
        'Unlimited healthcare providers',
        'Unlimited patient interactions',
        'Full-suite EHR integration',
        '24/7 dedicated support',
        'Custom AI training',
        'White-labeling options'
      ]
    }
  ];

  return (
    <section id="pricing" className="px-6 md:px-12 py-20 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1 bg-green-400 neo-border mb-4">PRICING</span>
          <h2 className="text-5xl font-bold mb-6">Simple, <span className="text-blue-500">Transparent</span> Pricing</h2>
          <p className="text-xl max-w-3xl mx-auto">Choose the plan that fits your practice size and needs. All plans include core AI functionality.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {pricingPlans.map((plan, index) => (
            <PricingCard key={index} {...plan} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;