import React from 'react';
import './TickerBanner.css';

const TickerBanner: React.FC = () => {
  // Content based on the target site's banner
  const bannerText = 'TRUSTED BY 500+ HEALTHCARE PROVIDERS • HIPAA COMPLIANT • 24/7 PATIENT SUPPORT • AI-POWERED MEDICAL ASSISTANCE • ';
  // Repeat the text to ensure smooth scrolling effect
  const repeatedText = Array(2).fill(bannerText).join('');

  return (
    <div className="bg-blue-500 text-white py-4 overflow-hidden">
      <div className="marquee">
        <div className="marquee-content text-xl font-bold">
          {repeatedText}
        </div>
      </div>
    </div>
  );
};

export default TickerBanner;