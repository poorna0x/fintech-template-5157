import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const BlogArticle = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-6 text-gray-900">
          How to Maintain Your RO Purifier at Home - Complete Guide
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">January 20, 2025 • Maintenance • 8 min read</p>

        <div className="prose prose-lg max-w-none">
          <p className="text-lg text-gray-700 mb-6">
            Ensuring your RO water purifier functions optimally is crucial for consistent access to clean and safe drinking water. Regular maintenance not only prolongs the life of your system but also guarantees the purity of the water it produces. Here's a comprehensive guide to help you maintain your RO purifier at home.
          </p>

          <h2 className="text-2xl font-semibold mb-4 text-gray-900">1. Regular Filter Replacement</h2>
          <p className="text-gray-700 mb-4">
            Filters are the heart of your RO system. Over time, they accumulate impurities and lose their effectiveness.
          </p>
          <ul className="list-disc list-inside ml-4 mb-6 text-gray-700">
            <li><strong>Sediment Filter:</strong> Replace every 6-12 months. This filter removes larger particles like sand, dirt, and rust.</li>
            <li><strong>Activated Carbon Filter:</strong> Replace every 6-12 months. It removes chlorine, organic chemicals, and improves taste and odor.</li>
            <li><strong>RO Membrane:</strong> Replace every 2-3 years. This is the most critical filter, responsible for removing dissolved solids, heavy metals, and bacteria.</li>
            <li><strong>Post-Carbon Filter:</strong> Replace every 12 months. It acts as a final polish for the water, enhancing taste.</li>
          </ul>
          <p className="text-gray-700 mb-6">
            Ignoring these replacements can lead to reduced water flow, poor water quality, and damage to the RO membrane.
          </p>

          <h2 className="text-2xl font-semibold mb-4 text-gray-900">2. Clean the RO Storage Tank</h2>
          <p className="text-gray-700 mb-4">
            Even with efficient filtration, the storage tank can accumulate biofilm or algae over time. It's recommended to clean the tank every 3-6 months.
          </p>
          <ul className="list-disc list-inside ml-4 mb-6 text-gray-700">
            <li>Turn off the water supply and power to the RO system.</li>
            <li>Drain the storage tank completely.</li>
            <li>Remove the tank and clean its interior with a mild, food-grade disinfectant solution.</li>
            <li>Rinse thoroughly with clean water before reassembling.</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4 text-gray-900">3. Check for Leaks and Damages</h2>
          <p className="text-gray-700 mb-4">
            Periodically inspect your RO system for any signs of leaks, cracks, or loose connections. Even small leaks can lead to significant water wastage and potential damage to your kitchen or flooring.
          </p>
          <ul className="list-disc list-inside ml-4 mb-6 text-gray-700">
            <li>Check all tubing and connections for moisture.</li>
            <li>Ensure the faucet is not dripping.</li>
            <li>If you find any issues, address them immediately or call a professional.</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4 text-gray-900">4. Monitor Water Pressure</h2>
          <p className="text-gray-700 mb-4">
            Optimal water pressure is essential for the efficient functioning of your RO membrane. Low water pressure can reduce the system's output and efficiency.
          </p>
          <ul className="list-disc list-inside ml-4 mb-6 text-gray-700">
            <li>Most RO systems require a minimum of 40-60 PSI.</li>
            <li>If your home's water pressure is consistently low, consider installing a booster pump.</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4 text-gray-900">5. Schedule Professional Servicing</h2>
          <p className="text-gray-700 mb-4">
            While DIY maintenance is helpful, professional servicing is indispensable. Hydrogen RO offers comprehensive maintenance plans in Bengaluru.
          </p>
          <ul className="list-disc list-inside ml-4 mb-6 text-gray-700">
            <li>Our certified technicians perform thorough inspections, advanced cleaning, and precise filter replacements.</li>
            <li>We also check for hidden issues and optimize your system for peak performance.</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4 text-gray-900">Conclusion</h2>
          <p className="text-gray-700 mb-6">
            Regular maintenance is key to enjoying pure, healthy water from your RO purifier for years to come. By following these simple steps and scheduling periodic professional servicing with Hydrogen RO, you can ensure your system remains in top condition.
          </p>
        </div>

        <Card className="cosmic-card mt-12">
          <CardContent className="p-8">
            <h3 className="text-2xl font-semibold mb-4 text-foreground">Need Professional Help?</h3>
            <p className="text-foreground mb-6">
              For professional RO maintenance and repair services in Bengaluru, contact Hydrogen RO.
            </p>
            <div className="space-y-3">
              <p className="text-foreground"><a href="tel:+918884944288" className="hover:underline cursor-pointer">📞 Call: +91-8884944288</a></p>
              <p className="text-foreground"><a href="tel:+919886944288" className="hover:underline cursor-pointer">📞 Call: +91-9886944288</a></p>
              <p className="text-foreground">✉️ Email: info@hydrogenro.com</p>
              <p className="text-foreground">Available: 24/7 Emergency Service</p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <button 
            onClick={() => navigate('/blog')}
            className="text-primary hover:underline font-medium"
          >
            ← Back to Blog
          </button>
        </div>
      </div>
      </main>

      <Footer />
    </div>
  );
};

export default BlogArticle;