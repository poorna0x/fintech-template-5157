import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Mail } from 'lucide-react';
import NotFound from './NotFound';

// Blog articles data - matches Blog.tsx
const blogArticles = [
  {
    slug: "maintain-ro-purifier-home-guide",
    title: "How to Maintain Your RO Purifier at Home - Complete Guide",
    date: "January 20, 2025",
    category: "Maintenance",
    readTime: "8 min read",
    content: "maintain-guide"
  },
  {
    slug: "ro-vs-uv-vs-uf-bengaluru-water",
    title: "RO vs UV vs UF Water Purifiers - Which is Best for Bengaluru Water?",
    date: "January 15, 2025",
    category: "Comparison",
    readTime: "6 min read",
    content: "ro-vs-uv-vs-uf"
  },
  {
    slug: "water-softeners-important-karnataka-homes",
    title: "Why Water Softeners are Important in Karnataka Homes",
    date: "January 10, 2025",
    category: "Water Treatment",
    readTime: "5 min read",
    content: "water-softeners"
  },
  {
    slug: "ro-filter-replacement-schedule-bengaluru",
    title: "RO Filter Replacement Schedule for Bengaluru Water Quality",
    date: "January 05, 2025",
    category: "Maintenance",
    readTime: "7 min read",
    content: "filter-replacement"
  },
  {
    slug: "10-signs-ro-purifier-needs-repair",
    title: "10 Signs Your RO Purifier Needs Repair - Bengaluru Guide",
    date: "December 28, 2024",
    category: "Repair",
    readTime: "4 min read",
    content: "signs-repair"
  },
  {
    slug: "best-ro-water-purifier-brands-bengaluru-2025",
    title: "Best RO Water Purifier Brands in Bengaluru 2025",
    date: "December 20, 2024",
    category: "Buying Guide",
    readTime: "10 min read",
    content: "best-brands"
  }
];

// Slug redirects for old URLs
const slugRedirects: Record<string, string> = {
  "signs-ro-purifier-needs-repair": "10-signs-ro-purifier-needs-repair",
  "best-ro-brands-bengaluru-2025": "best-ro-water-purifier-brands-bengaluru-2025",
  "ro-vs-uv-vs-uf-water-purifiers-bengaluru": "ro-vs-uv-vs-uf-bengaluru-water"
};

const BlogArticle = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [showCallOptions, setShowCallOptions] = useState(false);

  // Handle slug redirects
  useEffect(() => {
    if (slug && slugRedirects[slug]) {
      navigate(`/blog/${slugRedirects[slug]}`, { replace: true });
      return;
    }
  }, [slug, navigate]);

  // Find article by slug
  const article = slug ? blogArticles.find(a => a.slug === slug) : null;

  // If article not found and not a redirect, show 404
  if (!article && slug && !slugRedirects[slug]) {
    return <NotFound />;
  }

  // If no article found, show 404
  if (!article) {
    return <NotFound />;
  }

  const handleCall = (number: string) => {
    window.open(`tel:${number}`, '_self');
    setShowCallOptions(false);
  };

  const handleWhatsApp = () => {
    window.open('https://wa.me/918884944288', '_blank', 'noopener,noreferrer');
  };

  const handleEmail = () => {
    window.open('mailto:info@hydrogenro.com', '_self');
  };
  
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-6 text-gray-900">
          {article.title}
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">{article.date} • {article.category} • {article.readTime}</p>

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
            <h3 className="text-2xl font-semibold mb-6 text-center text-foreground">Need Professional Help?</h3>
            <p className="text-center text-muted-foreground mb-8">
            For professional RO maintenance and repair services in Bengaluru, contact Hydrogen RO.
          </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Call Button */}
              <div>
                <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-8 h-8 text-gray-600 dark:text-black" />
                </div>
                <h4 className="font-semibold text-foreground mb-2 text-center">Call Us</h4>
                <p className="text-sm text-muted-foreground mb-4 text-center">Speak directly with our RO experts</p>
                
                {!showCallOptions ? (
                  <Button 
                    onClick={() => setShowCallOptions(true)}
                    className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                  >
                    Call
                  </Button>
                ) : (
          <div className="space-y-2">
                    <Button 
                      onClick={() => handleCall('+918884944288')}
                      className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                    >
                      Call: +91-8884944288
                    </Button>
                    <Button 
                      onClick={() => handleCall('+919886944288')}
                      className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                    >
                      Call: +91-9886944288
                    </Button>
                    <Button 
                      onClick={() => setShowCallOptions(false)}
                      variant="outline"
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {/* Email Button */}
              <div>
                <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-gray-600 dark:text-black" />
                </div>
                <h4 className="font-semibold text-foreground mb-2 text-center">Email Us</h4>
                <p className="text-sm text-muted-foreground mb-4 text-center">Send us an email anytime</p>
                <Button 
                  onClick={handleEmail}
                  className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
              </div>

              {/* WhatsApp Button */}
              <div>
                <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </div>
                <h4 className="font-semibold text-foreground mb-2 text-center">WhatsApp</h4>
                <p className="text-sm text-muted-foreground mb-4 text-center">Chat with us on WhatsApp</p>
                <Button 
                  onClick={handleWhatsApp}
                  className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  WhatsApp
                </Button>
              </div>
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