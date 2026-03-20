/**
 * Hook customizado para carregar e cachear perguntas do questionário
 * Evita chamadas duplicadas ao banco de dados
 */

import { useState, useEffect } from 'react';
import { Question } from '../components/questionnaire/types';
import { QuestionMeta } from '../lib/questionnaireResults';
import { getQuestions } from '../lib/questions';

// Cache global para evitar múltiplas chamadas
let questionsCache: Question[] | null = null;
let questionsMapCache: Map<string, QuestionMeta> | null = null;
let loadingPromise: Promise<void> | null = null;

export const useQuestions = () => {
  const [questions, setQuestions] = useState<Question[]>(questionsCache || []);
  const [questionsMap, setQuestionsMap] = useState<Map<string, QuestionMeta>>(questionsMapCache || new Map());
  const [loading, setLoading] = useState(!questionsCache);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Se já temos cache, use-o imediatamente
    if (questionsCache && questionsMapCache) {
      setQuestions(questionsCache);
      setQuestionsMap(questionsMapCache);
      setLoading(false);
      return;
    }

    // Se já está carregando, aguarde a promise existente
    if (loadingPromise) {
      loadingPromise
        .then(() => {
          if (questionsCache && questionsMapCache) {
            setQuestions(questionsCache);
            setQuestionsMap(questionsMapCache);
            setLoading(false);
          }
        })
        .catch(err => {
          setError(err);
          setLoading(false);
        });
      return;
    }

    // Inicie novo carregamento
    loadingPromise = loadQuestions();
    loadingPromise
      .then(() => {
        if (questionsCache && questionsMapCache) {
          setQuestions(questionsCache);
          setQuestionsMap(questionsMapCache);
          setLoading(false);
        }
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      })
      .finally(() => {
        loadingPromise = null;
      });
  }, []);

  return { questions, questionsMap, loading, error };
};

async function loadQuestions(): Promise<void> {
  const data = await getQuestions();
  questionsCache = data;
  questionsMapCache = new Map<string, QuestionMeta>(
    data.map(q => [q.id, { id: q.id, category: q.category, group: q.group, positiveAnswer: q.positiveAnswer }]),
  );
}

/**
 * Função para limpar o cache quando necessário
 * Útil quando as perguntas são atualizadas no banco
 */
export const clearQuestionsCache = () => {
  questionsCache = null;
  questionsMapCache = null;
  loadingPromise = null;
};
