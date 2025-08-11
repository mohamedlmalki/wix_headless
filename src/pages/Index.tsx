import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, UserPlus, LogIn, ArrowRight, Sparkles, Shield, Zap } from "lucide-react";
import Navbar from "@/components/Navbar";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center max-w-4xl mx-auto animate-fade-in">
          <div className="mb-6">
            <Sparkles className="mx-auto h-16 w-16 text-primary mb-4 animate-glow" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
            Welcome to BusinessApp
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Your modern business platform for seamless communication and growth. 
            Connect, collaborate, and succeed with our professional tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup">
              <Button variant="hero" size="lg" className="gap-2 px-8">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="premium" size="lg" className="gap-2 px-8">
                <Mail className="h-4 w-4" />
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12 animate-slide-up">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Choose Us?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience the perfect blend of simplicity and power with our comprehensive platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="bg-gradient-card shadow-card border-primary/10 animate-slide-up transition-all duration-300 hover:shadow-elegant hover:scale-105">
            <CardContent className="p-8 text-center">
              <Shield className="mx-auto h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Secure & Reliable</h3>
              <p className="text-muted-foreground">
                Enterprise-grade security with 99.9% uptime guarantee. Your data is always safe and accessible.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-card border-primary/10 animate-slide-up transition-all duration-300 hover:shadow-elegant hover:scale-105" style={{animationDelay: "0.1s"}}>
            <CardContent className="p-8 text-center">
              <Zap className="mx-auto h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Lightning Fast</h3>
              <p className="text-muted-foreground">
                Optimized performance with instant loading times. Work efficiently without any delays.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-card border-primary/10 animate-slide-up transition-all duration-300 hover:shadow-elegant hover:scale-105" style={{animationDelay: "0.2s"}}>
            <CardContent className="p-8 text-center">
              <UserPlus className="mx-auto h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Easy to Use</h3>
              <p className="text-muted-foreground">
                Intuitive interface designed for everyone. Get started in minutes, not hours.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <Card className="bg-gradient-primary text-primary-foreground shadow-glow max-w-4xl mx-auto animate-glow">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
              Join thousands of professionals who trust our platform for their business needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button variant="secondary" size="lg" className="gap-2 px-8 bg-white text-primary hover:bg-white/90">
                  <UserPlus className="h-4 w-4" />
                  Create Account
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="lg" className="gap-2 px-8 border-white/20 text-white hover:bg-white/10">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Index;
