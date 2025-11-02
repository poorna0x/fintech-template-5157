import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, User, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Blog = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          "name": "Hydrogen RO Blog",
          "description": "Expert insights, maintenance tips, and latest news on RO water purification technology in Bengaluru",
          "url": "https://hydrogenro.com/blog",
          "publisher": {
            "@type": "Organization",
            "name": "Hydrogen RO",
            "logo": {
              "@type": "ImageObject",
              "url": "https://hydrogenro.com/logo.png"
            }
          }
        })}
      </script>

      <Header />

      <main className="flex-1">
        <PageHero 
          title="Hydrogen RO Blog"
          description="Expert insights, maintenance tips, and the latest news on water purification technology in Bengaluru, Karnataka"
          showButtons={true}
        />

      <section className="py-16 px-2 md:px-12 bg-background">
        <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {[
            {
              title: "How to Maintain Your RO Purifier at Home - Complete Guide",
              date: "January 20, 2025",
              category: "Maintenance",
              readTime: "8 min read",
              excerpt: "Learn the essential steps to keep your RO water purifier running efficiently and extend its lifespan with our comprehensive home maintenance guide for Bengaluru homeowners.",
              slug: "maintain-ro-purifier-home-guide"
            },
            {
              title: "RO vs UV vs UF Water Purifiers - Which is Best for Bengaluru Water?",
              date: "January 15, 2025",
              category: "Comparison",
              readTime: "6 min read",
              excerpt: "Confused about RO, UV, and UF? This comprehensive guide helps you choose the best water purification technology for Bengaluru's unique water quality issues.",
              slug: "ro-vs-uv-vs-uf-bengaluru-water"
            },
            {
              title: "Why Water Softeners are Important in Karnataka Homes",
              date: "January 10, 2025",
              category: "Water Treatment",
              readTime: "5 min read",
              excerpt: "Hard water is a common problem across Karnataka. Discover why water softeners are crucial for your home appliances, plumbing, and family's health.",
              slug: "water-softeners-important-karnataka-homes"
            },
            {
              title: "RO Filter Replacement Schedule for Bengaluru Water Quality",
              date: "January 05, 2025",
              category: "Maintenance",
              readTime: "7 min read",
              excerpt: "Understand when and why to replace your RO filters based on Bengaluru's specific water conditions to ensure pure, safe drinking water for your family.",
              slug: "ro-filter-replacement-schedule-bengaluru"
            },
            {
              title: "10 Signs Your RO Purifier Needs Repair - Bengaluru Guide",
              date: "December 28, 2024",
              category: "Repair",
              readTime: "4 min read",
              excerpt: "Don't wait for a complete breakdown. Learn the top 10 warning signs that indicate your RO water purifier needs immediate professional repair in Bengaluru.",
              slug: "10-signs-ro-purifier-needs-repair"
            },
            {
              title: "Best RO Water Purifier Brands in Bengaluru 2025",
              date: "December 20, 2024",
              category: "Buying Guide",
              readTime: "10 min read",
              excerpt: "A comprehensive review of the top RO water purifier brands available in Bengaluru, helping you make an informed purchase decision for your family.",
              slug: "best-ro-water-purifier-brands-bengaluru-2025"
            },
            {
              title: "Water Quality Testing in Bengaluru - Importance and Methods",
              date: "December 15, 2024",
              category: "Water Treatment",
              readTime: "6 min read",
              excerpt: "Discover why regular water quality testing is essential in Bengaluru and how to test your home's water for contaminants, TDS, and purity levels.",
              slug: "water-quality-testing-bengaluru-methods"
            },
            {
              title: "TDS Levels in Bengaluru Water - What You Need to Know",
              date: "December 10, 2024",
              category: "Water Treatment",
              readTime: "5 min read",
              excerpt: "Understand TDS (Total Dissolved Solids) levels in Bengaluru's water supply and how RO purification helps achieve safe drinking water standards.",
              slug: "tds-levels-bengaluru-water-know"
            },
            {
              title: "Emergency RO Repair Services in Bengaluru - When to Call",
              date: "December 05, 2024",
              category: "Repair",
              readTime: "4 min read",
              excerpt: "Learn when your RO purifier issue requires emergency repair services. Our 24/7 emergency technicians are available across all Bengaluru areas.",
              slug: "emergency-ro-repair-services-bengaluru"
            },
            {
              title: "Cost of RO Maintenance in Bengaluru - Complete Pricing Guide",
              date: "November 28, 2024",
              category: "Buying Guide",
              readTime: "7 min read",
              excerpt: "A detailed breakdown of RO maintenance costs in Bengaluru, including filter replacements, servicing, and annual maintenance contract pricing.",
              slug: "cost-ro-maintenance-bengaluru-pricing-guide"
            },
            {
              title: "RO Service Near Me in Bengaluru - Finding Reliable Technicians",
              date: "November 20, 2024",
              category: "Tips & Tricks",
              readTime: "5 min read",
              excerpt: "How to find trusted, certified RO service technicians near you in Bengaluru. Tips for choosing reliable service providers for your water purifier.",
              slug: "ro-service-near-me-bengaluru-tips"
            },
            {
              title: "DIY RO Troubleshooting Guide - Common Issues and Solutions",
              date: "November 15, 2024",
              category: "Tips & Tricks",
              readTime: "6 min read",
              excerpt: "Simple troubleshooting steps for common RO purifier problems you can fix at home before calling professional service in Bengaluru.",
              slug: "diy-ro-troubleshooting-guide-solutions"
            },
            {
              title: "Water Purifier Installation Process - Step by Step Guide",
              date: "November 10, 2024",
              category: "Installation",
              readTime: "8 min read",
              excerpt: "Complete step-by-step guide to professional RO water purifier installation in your Bengaluru home, including preparation and requirements.",
              slug: "water-purifier-installation-process-guide"
            },
            {
              title: "Benefits of AMC for RO Water Purifier in Bengaluru",
              date: "November 05, 2024",
              category: "Maintenance",
              readTime: "5 min read",
              excerpt: "Discover the advantages of Annual Maintenance Contract (AMC) for your RO purifier in Bengaluru - save money and ensure consistent water quality.",
              slug: "benefits-amc-ro-water-purifier-bengaluru"
            },
            {
              title: "RO Purifier Buying Tips - What to Consider Before Purchase",
              date: "October 28, 2024",
              category: "Buying Guide",
              readTime: "9 min read",
              excerpt: "Essential factors to consider when buying a new RO water purifier in Bengaluru - capacity, technology, brand, and after-sales service.",
              slug: "ro-purifier-buying-tips-considerations"
            }
          ].map((article, index) => (
            <Card key={index} className="cosmic-card hover:shadow-xl transition-all duration-300 cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
                    {article.category}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {article.readTime}
            </div>
            </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {article.title}
              </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Calendar className="w-3 h-3" />
                  {article.date}
            </div>
                <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
                  {article.excerpt}
                </p>
                <button 
                  onClick={() => navigate(`/blog/${article.slug}`)}
                  className="text-primary hover:underline text-sm font-medium"
                >
                  Read more →
                </button>
              </CardContent>
            </Card>
          ))}
        </div>

      </div>
      </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;