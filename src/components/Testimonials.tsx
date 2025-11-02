
import React, { useRef } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Testimonials = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -320, // Width of one testimonial card + gap
        behavior: 'smooth'
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 320, // Width of one testimonial card + gap
        behavior: 'smooth'
      });
    }
  };

  const testimonials = [
    {
      quote: "Hydrogen RO installed our new RO system perfectly in Koramangala. The water taste is amazing and the service was professional throughout. Best RO installation service in Bengaluru!",
      author: "Priya Sharma",
      position: "Homeowner, Koramangala",
      gender: "female"
    },
    {
      quote: "Their water softener service solved our hard water issues completely in Whitefield. Fast service and great pricing! Highly recommend Hydrogen RO for water treatment solutions.",
      author: "Rajesh Kumar",
      position: "Business Owner, Whitefield",
      gender: "male"
    },
    {
      quote: "Emergency RO repair service was excellent. They came the same day and fixed our RO system quickly in Indiranagar. Best emergency RO service in Bangalore!",
      author: "Anita Reddy",
      position: "Homeowner, Indiranagar",
      gender: "female"
    },
    {
      quote: "Best RO service in Bengaluru! The technician was knowledgeable and explained everything clearly. Water quality has improved significantly after RO installation.",
      author: "Suresh Patel",
      position: "Homeowner, Jayanagar",
      gender: "male"
    },
    {
      quote: "Professional RO installation and excellent customer service in HSR Layout. The team was punctual and cleaned up after the work. Highly satisfied with Hydrogen RO!",
      author: "Kavitha Nair",
      position: "Homeowner, HSR Layout",
      gender: "female"
    },
    {
      quote: "Great value for money! The RO maintenance package has kept our system running smoothly for over a year in Electronic City. Best RO maintenance service in Karnataka.",
      author: "Vikram Singh",
      position: "Business Owner, Electronic City",
      gender: "male"
    },
    {
      quote: "RO filter replacement service was quick and efficient in Banashankari. The technician was friendly and gave useful tips for RO maintenance. Excellent service!",
      author: "Meera Iyer",
      position: "Homeowner, Banashankari",
      gender: "female"
    },
    {
      quote: "Outstanding RO service! They fixed our water softener issue in no time in Malleswaram. The team is reliable and trustworthy. Best water treatment service in Bengaluru.",
      author: "Arjun Menon",
      position: "Homeowner, Malleswaram",
      gender: "male"
    },
    {
      quote: "Hydrogen RO provided excellent RO installation service in Marathahalli. The water quality is perfect and the technician was very professional. Highly recommended!",
      author: "Deepa Rao",
      position: "Homeowner, Marathahalli",
      gender: "female"
    },
    {
      quote: "Best RO repair service in Bengaluru! They fixed our RO system quickly in BTM Layout. The service was prompt, quick and the pricing was very reasonable.",
      author: "Naveen Kumar",
      position: "Homeowner, BTM Layout",
      gender: "male"
    }
  ];
  
  return (
    <section className="w-full py-20 px-2 md:px-12 bg-background relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 cosmic-grid opacity-20"></div>
      
      <div className="max-w-7xl mx-auto space-y-16 relative z-10">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-foreground">
            What our customers say
          </h2>
          <p className="text-muted-foreground text-lg">
            Join hundreds of satisfied customers who trust Hydrogen RO for their water treatment needs
          </p>
        </div>
        
        <div className="relative">
          {/* Navigation arrows - only show on desktop */}
          <div className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 -ml-16">
            <Button
              variant="outline"
              size="icon"
              onClick={scrollLeft}
              className="rounded-full bg-background/80 backdrop-blur-sm border-border/50 hover:scale-110 transition-transform duration-200 shadow-lg"
              style={{ WebkitBackdropFilter: 'blur(4px)' }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 -mr-16">
            <Button
              variant="outline"
              size="icon"
              onClick={scrollRight}
              className="rounded-full bg-background/80 backdrop-blur-sm border-border/50 hover:scale-110 transition-transform duration-200 shadow-lg"
              style={{ WebkitBackdropFilter: 'blur(4px)' }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <div ref={scrollContainerRef} className="overflow-x-auto pb-4 infinite-scroll">
            <div className="flex gap-6 min-w-max">
            {/* First set of testimonials */}
            {testimonials.map((testimonial, index) => (
              <div 
                key={`first-${index}`}
                className="flex-shrink-0 w-80 p-6 rounded-xl border border-border bg-background/80 backdrop-blur-sm hover:border-border/60 transition-all duration-300"
              >
                <div className="mb-6">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-primary inline-block mr-1">★</span>
                  ))}
                </div>
                <p className="text-lg mb-8 text-foreground/90 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 flex items-center justify-center">
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-medium text-foreground">{testimonial.author}</h4>
                    <p className="text-sm text-muted-foreground">{testimonial.position}</p>
                  </div>
                </div>
              </div>
            ))}
            {/* Duplicate set for seamless loop */}
            {testimonials.map((testimonial, index) => (
              <div 
                key={`second-${index}`}
                className="flex-shrink-0 w-80 p-6 rounded-xl border border-border bg-background/80 backdrop-blur-sm hover:border-border/60 transition-all duration-300"
              >
                <div className="mb-6">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-primary inline-block mr-1">★</span>
                  ))}
                </div>
                <p className="text-lg mb-8 text-foreground/90 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 flex items-center justify-center">
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-medium text-foreground">{testimonial.author}</h4>
                    <p className="text-sm text-muted-foreground">{testimonial.position}</p>
                  </div>
                </div>
              </div>
            ))}
            {/* Third set for better infinite scroll */}
            {testimonials.map((testimonial, index) => (
              <div 
                key={`third-${index}`}
                className="flex-shrink-0 w-80 p-6 rounded-xl border border-border bg-background/80 backdrop-blur-sm hover:border-border/60 transition-all duration-300"
              >
                <div className="mb-6">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-primary inline-block mr-1">★</span>
                  ))}
                </div>
                <p className="text-lg mb-8 text-foreground/90 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 flex items-center justify-center">
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-medium text-foreground">{testimonial.author}</h4>
                    <p className="text-sm text-muted-foreground">{testimonial.position}</p>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
