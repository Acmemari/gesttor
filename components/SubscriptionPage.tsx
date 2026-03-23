import React from 'react';
import { User } from '../types';
import { PLANS } from '../constants';
import { Check, Zap, Shield, Crown } from 'lucide-react';

interface SubscriptionPageProps {
  user: User;
  onUpgrade: (planId: string) => void;
  onBack: () => void;
}

const SubscriptionPage: React.FC<SubscriptionPageProps> = ({ user, onUpgrade, onBack }) => {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4 animate-in fade-in duration-500">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-ai-text mb-2">Planos e Assinatura</h2>
        <p className="text-ai-subtext">Escolha o plano ideal para escalar sua produção pecuária.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map(plan => {
          const isCurrent = user.plan === plan.id;
          const isPopular = plan.id === 'gestor';

          return (
            <div
              key={plan.id}
              className={`
                relative rounded-2xl border p-6 flex flex-col h-full transition-all duration-200
                ${
                  isCurrent
                    ? 'border-ai-accent bg-ai-accent/5 ring-1 ring-ai-accent'
                    : 'border-ai-border bg-white hover:border-ai-subtext/50 hover:shadow-lg'
                }
                ${isPopular && !isCurrent ? 'border-ai-text/20 shadow-md' : ''}
              `}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-ai-text text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
                  Mais Popular
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-lg font-bold text-ai-text flex items-center gap-2">
                  {plan.id === 'pro' && <Crown size={18} className="text-amber-500" />}
                  {plan.id === 'gestor' && <Zap size={18} className="text-ai-accent" />}
                  {plan.id === 'essencial' && <Shield size={18} className="text-ai-subtext" />}
                  {plan.name}
                </h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-ai-text">R$ {plan.price}</span>
                  <span className="text-sm text-ai-subtext">/mês</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-ai-subtext">
                    <Check size={16} className={`shrink-0 mt-0.5 ${isCurrent ? 'text-ai-accent' : 'text-green-600'}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => !isCurrent && onUpgrade(plan.id)}
                disabled={isCurrent}
                className={`
                  w-full py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    isCurrent
                      ? 'bg-transparent text-ai-accent border border-ai-accent cursor-default'
                      : plan.id === 'gestor'
                        ? 'bg-ai-accent text-white hover:bg-ai-accentHover'
                        : 'bg-ai-text text-white hover:bg-black'
                  }
                `}
              >
                {isCurrent ? 'Plano Atual' : 'Selecionar Plano'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-12 p-6 bg-ai-surface rounded-xl border border-ai-border text-center">
        <h4 className="font-medium text-ai-text mb-2">Precisa de um plano customizado?</h4>
        <p className="text-sm text-ai-subtext mb-4">
          Para grandes fazendas ou cooperativas, temos soluções sob medida.
        </p>
        <button className="text-ai-accent text-sm font-medium hover:underline">Fale com nosso time de vendas</button>
      </div>
    </div>
  );
};

export default SubscriptionPage;
