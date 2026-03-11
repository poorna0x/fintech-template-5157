import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Check, X, AlertTriangle, Shield } from 'lucide-react';
import { useSecurity } from '@/contexts/SecurityContext';

interface MathCaptchaProps {
  onVerify: (isValid: boolean) => void;
  onAutoSubmit?: () => void;
  className?: string;
}

interface MathChallenge {
  question: string;
  answer: number;
}

const MathCaptcha: React.FC<MathCaptchaProps> = ({ onVerify, onAutoSubmit, className = '' }) => {
  const [challenge, setChallenge] = useState<MathChallenge | null>(null);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [showError, setShowError] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  
  // Security context
  const { 
    difficultyLevel, 
    isRateLimited, 
    rateLimitMessage, 
    incrementAttempts,
    getSecurityStatus 
  } = useSecurity();

  const generateChallenge = (): MathChallenge => {
    // Progressive difficulty based on security level
    const baseRange = Math.min(10 + (difficultyLevel * 5), 50);
    
    // More sophisticated problems for higher levels
    if (difficultyLevel >= 4) {
      return generateAdvancedChallenge();
    } else if (difficultyLevel >= 3) {
      return generateIntermediateChallenge();
    } else {
      return generateBasicChallenge();
    }
  };

  const generateBasicChallenge = (): MathChallenge => {
    const num1 = Math.floor(Math.random() * 15) + 1;
    const num2 = Math.floor(Math.random() * 15) + 1;
    const operations = ['+', '-', '×'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let answer: number;
    let question: string;
    
    switch(operation) {
      case '+':
        answer = num1 + num2;
        question = `${num1} + ${num2} = ?`;
        break;
      case '-': {
        const larger = Math.max(num1, num2);
        const smaller = Math.min(num1, num2);
        answer = larger - smaller;
        question = `${larger} - ${smaller} = ?`;
        break;
      }
      case '×': {
        const factor1 = Math.floor(Math.random() * 6) + 1;
        const factor2 = Math.floor(Math.random() * 6) + 1;
        answer = factor1 * factor2;
        question = `${factor1} × ${factor2} = ?`;
        break;
      }
      default:
        answer = num1 + num2;
        question = `${num1} + ${num2} = ?`;
    }
    
    return { question, answer };
  };

  const generateIntermediateChallenge = (): MathChallenge => {
    const challengeTypes = ['word_problem', 'sequence', 'percentage', 'fraction'];
    const type = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
    
    switch(type) {
      case 'word_problem':
        return generateWordProblem();
      case 'sequence':
        return generateSequence();
      case 'percentage':
        return generatePercentage();
      case 'fraction':
        return generateFraction();
      default:
        return generateBasicChallenge();
    }
  };

  const generateAdvancedChallenge = (): MathChallenge => {
    const challengeTypes = ['complex_word', 'multi_step', 'algebra', 'geometry'];
    const type = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
    
    switch(type) {
      case 'complex_word':
        return generateComplexWordProblem();
      case 'multi_step':
        return generateMultiStep();
      case 'algebra':
        return generateAlgebra();
      case 'geometry':
        return generateGeometry();
      default:
        return generateIntermediateChallenge();
    }
  };

  const generateWordProblem = (): MathChallenge => {
    const problems = [
      { question: "If a pizza has 8 slices and you eat 3, how many are left?", answer: 5 },
      { question: "A box has 12 apples. You take out 4. How many remain?", answer: 8 },
      { question: "You have 15 candies and give away 7. How many do you have left?", answer: 8 },
      { question: "A train has 20 cars. 6 cars are removed. How many cars remain?", answer: 14 }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  };

  const generateSequence = (): MathChallenge => {
    const sequences = [
      { question: "What comes next: 2, 4, 6, 8, ?", answer: 10 },
      { question: "What comes next: 1, 3, 5, 7, ?", answer: 9 },
      { question: "What comes next: 5, 10, 15, 20, ?", answer: 25 },
      { question: "What comes next: 3, 6, 9, 12, ?", answer: 15 }
    ];
    return sequences[Math.floor(Math.random() * sequences.length)];
  };

  const generatePercentage = (): MathChallenge => {
    const problems = [
      { question: "What is 50% of 20?", answer: 10 },
      { question: "What is 25% of 16?", answer: 4 },
      { question: "What is 10% of 50?", answer: 5 },
      { question: "What is 75% of 12?", answer: 9 }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  };

  const generateFraction = (): MathChallenge => {
    const problems = [
      { question: "What is 1/2 of 10?", answer: 5 },
      { question: "What is 1/4 of 12?", answer: 3 },
      { question: "What is 1/3 of 15?", answer: 5 },
      { question: "What is 2/3 of 9?", answer: 6 }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  };

  const generateComplexWordProblem = (): MathChallenge => {
    const problems = [
      { question: "A store has 24 items. They sell 8 in the morning and 6 in the afternoon. How many are left?", answer: 10 },
      { question: "You have $30. You spend $12 on lunch and $8 on coffee. How much do you have left?", answer: 10 },
      { question: "A garden has 18 flowers. 5 are red, 7 are blue. How many are other colors?", answer: 6 },
      { question: "A class has 25 students. 12 are boys. How many are girls?", answer: 13 }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  };

  const generateMultiStep = (): MathChallenge => {
    const problems = [
      { question: "What is (5 + 3) × 2?", answer: 16 },
      { question: "What is (10 - 4) + 7?", answer: 13 },
      { question: "What is (6 × 2) - 3?", answer: 9 },
      { question: "What is (15 ÷ 3) + 4?", answer: 9 }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  };

  const generateAlgebra = (): MathChallenge => {
    const problems = [
      { question: "If x + 5 = 12, what is x?", answer: 7 },
      { question: "If 2x = 14, what is x?", answer: 7 },
      { question: "If x - 3 = 8, what is x?", answer: 11 },
      { question: "If x ÷ 2 = 6, what is x?", answer: 12 }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  };

  const generateGeometry = (): MathChallenge => {
    const problems = [
      { question: "A square has sides of 4. What is its area?", answer: 16 },
      { question: "A rectangle is 5 long and 3 wide. What is its area?", answer: 15 },
      { question: "A triangle has base 6 and height 4. What is its area?", answer: 12 },
      { question: "A circle has radius 3. What is its area? (use π = 3)", answer: 27 }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  };

  const initializeChallenge = () => {
    const newChallenge = generateChallenge();
    setChallenge(newChallenge);
    setUserAnswer('');
    setIsVerified(false);
    setShowError(false);
    onVerify(false);
  };

  useEffect(() => {
    initializeChallenge();
  }, []);

  const handleSubmit = async () => {
    if (!challenge || !userAnswer.trim()) {
      setShowError(true);
      return;
    }

    // Check rate limiting
    if (isRateLimited) {
      setShowError(true);
      return;
    }

    setIsLoading(true);
    setAttemptCount(prev => prev + 1);
    
    // Increment security attempts
    incrementAttempts();
    
    // Simulate a small delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const userAnswerNum = parseInt(userAnswer.trim());
    const isValid = userAnswerNum === challenge.answer;
    
    setIsVerified(isValid);
    setShowError(!isValid);
    onVerify(isValid);
    
    if (isValid) {
      // Auto-submit the form after successful verification
      setTimeout(() => {
        if (onAutoSubmit) {
          onAutoSubmit();
        }
      }, 1000);
    } else {
      // Reset for retry after 2 seconds
      setTimeout(() => {
        initializeChallenge();
      }, 2000);
    }
    
    setIsLoading(false);
  };

  const handleRefresh = () => {
    initializeChallenge();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const securityStatus = getSecurityStatus();
  
  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm font-medium text-foreground">Security Check</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
          disabled={isRateLimited}
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>
      
      <div className="space-y-3">
        <div className="text-center">
          <p className="text-muted-foreground text-sm mb-2">
            Please solve this math problem:
          </p>
          <div className="bg-muted border border-border rounded-md p-3">
            <p className="text-xl font-mono font-bold text-foreground">
              {challenge?.question}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={userAnswer}
            onChange={(e) => {
              setUserAnswer(e.target.value);
              setShowError(false);
            }}
            onKeyPress={handleKeyPress}
            placeholder="Your answer"
            className={`flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              showError ? 'border-red-500' : ''
            }`}
            disabled={isLoading}
          />
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !userAnswer.trim()}
            className="px-4"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isVerified ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              'Check'
            )}
          </Button>
        </div>
        
        {showError && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <X className="w-4 h-4" />
            <span>Incorrect answer. Please try again.</span>
          </div>
        )}
        
        {isVerified && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <Check className="w-4 h-4" />
            <span>Verified! You can proceed.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MathCaptcha;
