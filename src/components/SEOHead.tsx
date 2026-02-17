import React from 'react';

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
}

const SEOHead: React.FC<SEOHeadProps> = ({ 
  title, 
  description, 
  keywords = "RO water purifier Bengaluru, RO installation Bangalore, RO repair Karnataka, water softener Bangalore, RO maintenance Bengaluru, RO service Electronic City, RO service BTM, RO service HSR Layout, RO service Whitefield, RO service Koramangala, RO service Hebbal, RO service Yelahanka, RO service Sarjapur, RO service Bellandur, RO service JP Nagar, RO service Banashankari, RO service Tumakuru, RO service Nelamangala, RO service Attibele, RO service Chandapura, RO service Devanahalli, best RO service Bangalore",
  canonical,
  ogImage = "https://hydrogenro.com/og-image.jpg"
}) => {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      {canonical && <link rel="canonical" href={canonical} />}
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical || window.location.href} />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </>
  );
};

export default SEOHead;
