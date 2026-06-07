import React from 'react';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BookingRedirect: React.FC = () => {
  const navigate = useNavigate();

  const handleBookService = () => {
    navigate('/book');
  };

  return (
    <section id="booking" className="py-16 px-4 md:px-12 bg-background">
      <div className="max-w-5xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 to-cyan-500 px-6 py-12 md:px-12 md:py-16 text-center shadow-xl shadow-sky-600/20">
          {/* decorative blobs */}
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10" />
          <div className="absolute -bottom-20 -left-12 w-64 h-64 rounded-full bg-white/10" />

          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              Book RO Service in Bengaluru
            </h2>
            <p className="text-base md:text-lg text-sky-50/90 mb-8">
              Certified technicians at your doorstep — same day. No account needed.
            </p>

            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 mb-8 text-sky-50">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Phone className="w-4 h-4" /> Instant confirmation
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Clock className="w-4 h-4" /> Flexible time slots
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <MapPin className="w-4 h-4" /> All areas covered
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={handleBookService}
                size="lg"
                className="bg-white text-sky-700 hover:bg-sky-50 px-8 h-12 text-base font-semibold shadow-lg"
              >
                Book Service Now
              </Button>
              <Button
                onClick={() => window.open('tel:+918884944288', '_self')}
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base font-semibold border-white/70 bg-white/10 text-white hover:bg-white/20 flex items-center gap-2"
              >
                <Phone className="w-4 h-4" />
                +91-8884944288
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookingRedirect;
