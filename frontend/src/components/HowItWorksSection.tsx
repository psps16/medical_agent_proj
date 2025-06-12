import React from 'react';
import './HowItWorksSection.css';

const HowItWorksSection: React.FC = () => {

  return (
    <section id="medical-ai" className="px-6 md:px-12 py-20 bg-blue-50 relative diagonal-bg">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold mb-6">Powerful <span className="text-blue-500">Healthcare</span> Solutions</h2>
          <p className="text-xl max-w-3xl mx-auto">Our AI medical assistant enhances healthcare delivery for providers and patients alike.</p>
        </div>
        
        <div className="bg-white neo-border p-6 md:p-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h3 className="text-3xl font-bold mb-6">Used by Both <span className="text-blue-500">Doctors</span> and <span className="text-blue-500">Patients</span></h3>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <div className="bg-green-100 p-2 rounded-full mr-3 mt-1">
                    <i className="fas fa-check text-green-600"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-xl mb-1">For Patients</h4>
                    <p>Ask health questions, schedule appointments, get medication reminders, and receive personalized care instructions.</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <div className="bg-green-100 p-2 rounded-full mr-3 mt-1">
                    <i className="fas fa-check text-green-600"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-xl mb-1">For Doctors</h4>
                    <p>Streamline documentation, access patient data, receive clinical decision support, and optimize patient management.</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <div className="bg-green-100 p-2 rounded-full mr-3 mt-1">
                    <i className="fas fa-check text-green-600"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-xl mb-1">For Practices</h4>
                    <p>Reduce administrative burden, enhance patient satisfaction, improve care quality, and optimize resource allocation.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="pattern-dots p-8">
              <div className="bg-white neo-border p-6">
                <div className="flex items-center mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-md neo-border">
                    <p className="text-sm text-gray-500 mb-1">Doctor Interface</p>
                    <p className="mb-2"><strong>MediAgent:</strong> Dr. Johnson, Patient Roberts has reported increased blood pressure readings over the past week. Would you like to see the trend analysis?</p>
                    <div className="flex gap-2">
                      <button className="bg-blue-500 text-white px-3 py-1 text-sm rounded">View Trends</button>
                      <button className="bg-gray-200 px-3 py-1 text-sm rounded">Schedule Follow-up</button>
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-md neo-border">
                    <p className="text-sm text-gray-500 mb-1">Patient Interface</p>
                    <p><strong>MediAgent:</strong> Good morning, Sarah. It's time for your morning medication. Your blood pressure reading was also due today. Would you like me to guide you through it?</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;