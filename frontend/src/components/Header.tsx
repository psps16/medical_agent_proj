import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

const Header: React.FC = () => {
  return (
    <nav className="bg-white py-4 neo-border mb-6">
      <div className="logo-container">
        <span className="text-3xl font-bold">Medi<span className="text-blue-500">Agent</span></span>
      </div>
      <div className="button-container">
        <Link to="/register" className="neo-btn bg-blue-500 text-white px-6 py-2 inline-block">Sign Up</Link>
      </div>
    </nav>
  );
};

export default Header;