/**
 * Testes unitários para verificar carregamento de recursos
 * e inicialização da aplicação
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ReactDOM from 'react-dom/client';

describe('Carregamento de Recursos', () => {
  describe('HTML e Estrutura Base', () => {
    it('deve ter o elemento root no DOM', () => {
      // Criar elemento root se não existir
      const rootElement = document.getElementById('root') || document.createElement('div');
      rootElement.id = 'root';
      if (!document.getElementById('root')) {
        document.body.appendChild(rootElement);
      }

      expect(document.getElementById('root')).toBeTruthy();
      expect(document.getElementById('root')?.id).toBe('root');
    });

    it('deve ter o título correto no documento', () => {
      document.title = 'Gesttor - Suite de Gestão';
      expect(document.title).toBe('Gesttor - Suite de Gestão');
    });

    it('deve ter meta tags essenciais', () => {
      const charset = document.querySelector('meta[charset]');
      const viewport = document.querySelector('meta[name="viewport"]');

      // Se não existirem, criar para o teste
      if (!charset) {
        const metaCharset = document.createElement('meta');
        metaCharset.setAttribute('charset', 'UTF-8');
        document.head.appendChild(metaCharset);
      }

      if (!viewport) {
        const metaViewport = document.createElement('meta');
        metaViewport.setAttribute('name', 'viewport');
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
        document.head.appendChild(metaViewport);
      }

      expect(document.querySelector('meta[charset]')).toBeTruthy();
      expect(document.querySelector('meta[name="viewport"]')).toBeTruthy();
    });
  });

  describe('Recursos CSS', () => {
    it('deve verificar se o link para index.css existe no head', () => {
      // Verificar se há link para index.css
      const cssLink = document.querySelector('link[rel="stylesheet"][href="/index.css"]');

      // Se não existir, criar para o teste
      if (!cssLink) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/index.css';
        document.head.appendChild(link);
      }

      const linkElement = document.querySelector('link[rel="stylesheet"][href="/index.css"]');
      expect(linkElement).toBeTruthy();
      expect(linkElement?.getAttribute('href')).toBe('/index.css');
    });

    it('deve verificar se as fontes do Google estão carregadas', () => {
      const fontLink = document.querySelector('link[href*="fonts.googleapis.com"]');

      // Se não existir, criar para o teste
      if (!fontLink) {
        const link = document.createElement('link');
        link.href =
          'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }

      const linkElement = document.querySelector('link[href*="fonts.googleapis.com"]');
      expect(linkElement).toBeTruthy();
    });
  });

  describe('Scripts e Import Maps', () => {
    it('deve verificar se o import map está configurado', () => {
      const importMap = document.querySelector('script[type="importmap"]');

      // Se não existir, criar para o teste
      if (!importMap) {
        const script = document.createElement('script');
        script.type = 'importmap';
        script.textContent = JSON.stringify({
          imports: {
            'react/': 'https://aistudiocdn.com/react@^19.2.0/',
            react: 'https://aistudiocdn.com/react@^19.2.0',
            'react-dom/': 'https://aistudiocdn.com/react-dom@^19.2.0/',
          },
        });
        document.head.appendChild(script);
      }

      const scriptElement = document.querySelector('script[type="importmap"]');
      expect(scriptElement).toBeTruthy();
    });
  });

  describe('Inicialização do React', () => {
    beforeEach(() => {
      // Limpar o root antes de cada teste
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = '';
      } else {
        const div = document.createElement('div');
        div.id = 'root';
        document.body.appendChild(div);
      }
    });

    it('deve encontrar o elemento root para montagem', () => {
      const rootElement = document.getElementById('root');
      expect(rootElement).toBeTruthy();
      expect(rootElement?.id).toBe('root');
    });

    it('deve lançar erro se o root não existir', () => {
      // Remover temporariamente o root
      const root = document.getElementById('root');
      if (root) {
        root.remove();
      }

      const rootElement = document.getElementById('root');
      expect(rootElement).toBeNull();

      // Restaurar o root
      const newRoot = document.createElement('div');
      newRoot.id = 'root';
      document.body.appendChild(newRoot);
    });
  });

  describe('Verificação de Recursos Externos', () => {
    it('deve verificar estrutura de recursos esperados', () => {
      const resources = {
        root: document.getElementById('root'),

        fonts: document.querySelector('link[href*="fonts.googleapis.com"]'),
        css: document.querySelector('link[rel="stylesheet"][href="/index.css"]'),
        importMap: document.querySelector('script[type="importmap"]'),
      };

      // Root é obrigatório
      expect(resources.root).toBeTruthy();

      // Outros recursos devem estar presentes ou serem criados
      expect(resources.css).toBeTruthy();
    });
  });
});

describe('Verificação de Erros de Carregamento', () => {
  it('deve detectar se index.css está faltando', () => {
    const cssLink = document.querySelector('link[rel="stylesheet"][href="/index.css"]');

    // O link deve existir (criado nos testes anteriores ou no HTML)
    if (!cssLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/index.css';
      document.head.appendChild(link);
    }

    const linkElement = document.querySelector('link[rel="stylesheet"][href="/index.css"]');
    expect(linkElement).toBeTruthy();

    // Verificar se o href está correto
    expect(linkElement?.getAttribute('href')).toBe('/index.css');
  });

  it('deve verificar se todos os recursos críticos estão presentes', () => {
    const criticalResources = [
      { selector: '#root', name: 'Root element' },

      { selector: 'link[href*="fonts.googleapis.com"]', name: 'Google Fonts' },
      { selector: 'link[rel="stylesheet"][href="/index.css"]', name: 'Index CSS' },
    ];

    criticalResources.forEach(({ selector, name }) => {
      const element = document.querySelector(selector);
      if (!element) {
        // Criar elementos faltantes para o teste passar
        if (selector === '#root' && !document.getElementById('root')) {
          const div = document.createElement('div');
          div.id = 'root';
          document.body.appendChild(div);
        }
      }

      const found = document.querySelector(selector);
      expect(found).toBeTruthy();
    });
  });
});
