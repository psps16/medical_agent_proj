import React from 'react';
import { Link } from 'react-router-dom';
import './HeroSection.css';

const HeroSection: React.FC = () => {
  return (
    <section className="px-6 md:px-12 py-20 relative">
      <div className="circle-accent top-10 left-20 opacity-30"></div>
      <div className="circle-accent bottom-10 right-40 opacity-20"></div>
      
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="bg-blue-500 text-white px-4 py-1 rounded-full neo-border inline-block mb-4">AI + HEALTHCARE</span>
            <h1 className="text-6xl md:text-7xl font-bold mb-6 leading-tight">Your Medical <span className="text-blue-500">AI Assistant</span></h1>
            <p className="text-xl mb-8">Streamlining communication between doctors and patients with intelligent AI technology. Get instant medical information, schedule appointments, and receive personalized care support.</p>
            <div className="flex flex-wrap gap-4">
              <Link to="/register" className="neo-btn bg-blue-500 text-white px-8 py-3 text-lg">Get Started</Link>
              <a href="#how-it-works" className="neo-btn bg-white px-8 py-3 text-lg">See How It Works</a>
            </div>
          </div>
          <div className="neo-border p-1 bg-white">
            <div className="bg-gray-100 p-6 rounded-sm h-full">
              <div className="bg-white p-4 neo-border mb-4">
                <div className="flex items-center mb-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="hash-pattern p-4">
                  <div className="bg-white neo-border p-4">
                    <p className="font-bold mb-2">MediAgent:</p>
                    <p>Hello! I'm your medical assistant. How can I help you today?</p>
                  </div>
                  <div className="bg-blue-50 neo-border p-4 mt-4">
                    <p className="font-bold mb-2">Patient:</p>
                    <p>I've been experiencing headaches after using my computer for long hours</p>
                  </div>
                  <div className="bg-white neo-border p-4 mt-4">
                    <p className="font-bold mb-2">MediAgent:</p>
                    <p>I understand. This could be digital eye strain. Let me suggest some relief techniques and determine if you should see a doctor...</p>
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

export default HeroSection;