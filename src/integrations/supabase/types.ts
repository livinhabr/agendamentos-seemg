export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          atendente_id: string | null
          bot_id: string | null
          calendario_id: string | null
          conversa_id: string | null
          created_at: string
          email_usuario: string
          fim: string
          google_event_id: string | null
          id: string
          idempotency_key: string | null
          inicio: string
          nome_usuario: string
          payload_evento: Json
          servico_id: string | null
          setor_id: string
          status: string
        }
        Insert: {
          atendente_id?: string | null
          bot_id?: string | null
          calendario_id?: string | null
          conversa_id?: string | null
          created_at?: string
          email_usuario: string
          fim: string
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          inicio: string
          nome_usuario: string
          payload_evento?: Json
          servico_id?: string | null
          setor_id: string
          status?: string
        }
        Update: {
          atendente_id?: string | null
          bot_id?: string | null
          calendario_id?: string | null
          conversa_id?: string | null
          created_at?: string
          email_usuario?: string
          fim?: string
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          inicio?: string
          nome_usuario?: string
          payload_evento?: Json
          servico_id?: string | null
          setor_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "atendentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "calendarios_setor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_chat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      atendente_google_connections: {
        Row: {
          access_token: string
          atendente_id: string
          calendar_id: string | null
          created_at: string | null
          google_email: string
          id: string
          refresh_token: string | null
          scope: string | null
          status: string | null
          token_expiry: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          atendente_id: string
          calendar_id?: string | null
          created_at?: string | null
          google_email: string
          id?: string
          refresh_token?: string | null
          scope?: string | null
          status?: string | null
          token_expiry: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          atendente_id?: string
          calendar_id?: string | null
          created_at?: string | null
          google_email?: string
          id?: string
          refresh_token?: string | null
          scope?: string | null
          status?: string | null
          token_expiry?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendente_google_connections_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: true
            referencedRelation: "atendentes"
            referencedColumns: ["id"]
          },
        ]
      }
      atendentes: {
        Row: {
          ativo: boolean
          calendario_id: string | null
          cargo: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          setor_id: string
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          calendario_id?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          setor_id: string
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          calendario_id?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          setor_id?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendentes_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "calendarios_setor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendentes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      atendentes_servicos: {
        Row: {
          atendente_id: string
          ativo: boolean
          id: string
          servico_id: string
        }
        Insert: {
          atendente_id: string
          ativo?: boolean
          id?: string
          servico_id: string
        }
        Update: {
          atendente_id?: string
          ativo?: boolean
          id?: string
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendentes_servicos_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "atendentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendentes_servicos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos_agendamento"
            referencedColumns: ["id"]
          },
        ]
      }
      bots_agendamento: {
        Row: {
          ativo: boolean
          calendario_id: string | null
          created_at: string
          exige_email_usuario: boolean
          exige_nome_usuario: boolean
          id: string
          instrucoes_especificas: string | null
          mensagem_fora_escopo: string
          nome: string
          saudacao_inicial: string
          setor_id: string
          slug: string
          tom_de_voz: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          calendario_id?: string | null
          created_at?: string
          exige_email_usuario?: boolean
          exige_nome_usuario?: boolean
          id?: string
          instrucoes_especificas?: string | null
          mensagem_fora_escopo?: string
          nome: string
          saudacao_inicial?: string
          setor_id: string
          slug: string
          tom_de_voz?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          calendario_id?: string | null
          created_at?: string
          exige_email_usuario?: boolean
          exige_nome_usuario?: boolean
          id?: string
          instrucoes_especificas?: string | null
          mensagem_fora_escopo?: string
          nome?: string
          saudacao_inicial?: string
          setor_id?: string
          slug?: string
          tom_de_voz?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bots_agendamento_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "calendarios_setor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bots_agendamento_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      calendarios_setor: {
        Row: {
          ativo: boolean
          created_at: string
          google_calendar_id: string
          id: string
          modo_conexao: string
          nome: string
          observacao: string | null
          setor_id: string
          status_conexao: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          google_calendar_id: string
          id?: string
          modo_conexao?: string
          nome: string
          observacao?: string | null
          setor_id: string
          status_conexao?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          google_calendar_id?: string
          id?: string
          modo_conexao?: string
          nome?: string
          observacao?: string | null
          setor_id?: string
          status_conexao?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendarios_setor_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_formulario_chat: {
        Row: {
          ativo: boolean
          bot_id: string
          id: string
          nome_campo: string
          obrigatorio: boolean
          opcoes_json: Json | null
          ordem: number
          rotulo: string
          tipo_campo: string
        }
        Insert: {
          ativo?: boolean
          bot_id: string
          id?: string
          nome_campo: string
          obrigatorio?: boolean
          opcoes_json?: Json | null
          ordem?: number
          rotulo: string
          tipo_campo?: string
        }
        Update: {
          ativo?: boolean
          bot_id?: string
          id?: string
          nome_campo?: string
          obrigatorio?: boolean
          opcoes_json?: Json | null
          ordem?: number
          rotulo?: string
          tipo_campo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campos_formulario_chat_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots_agendamento"
            referencedColumns: ["id"]
          },
        ]
      }
      canais_widget: {
        Row: {
          ativo: boolean
          bot_id: string
          cor_primaria: string | null
          created_at: string
          id: string
          nome: string
          permitido_embedar: boolean
          posicao: string
          site_origem: string | null
          subtitulo_widget: string | null
          titulo_widget: string
        }
        Insert: {
          ativo?: boolean
          bot_id: string
          cor_primaria?: string | null
          created_at?: string
          id?: string
          nome: string
          permitido_embedar?: boolean
          posicao?: string
          site_origem?: string | null
          subtitulo_widget?: string | null
          titulo_widget?: string
        }
        Update: {
          ativo?: boolean
          bot_id?: string
          cor_primaria?: string | null
          created_at?: string
          id?: string
          nome?: string
          permitido_embedar?: boolean
          posicao?: string
          site_origem?: string | null
          subtitulo_widget?: string | null
          titulo_widget?: string
        }
        Relationships: [
          {
            foreignKeyName: "canais_widget_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots_agendamento"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_chat: {
        Row: {
          bot_id: string
          canal_widget_id: string | null
          contexto_json: Json
          created_at: string
          email_usuario: string | null
          estado_json: Json
          external_user_id: string | null
          id: string
          nome_usuario: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bot_id: string
          canal_widget_id?: string | null
          contexto_json?: Json
          created_at?: string
          email_usuario?: string | null
          estado_json?: Json
          external_user_id?: string | null
          id?: string
          nome_usuario?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bot_id?: string
          canal_widget_id?: string | null
          contexto_json?: Json
          created_at?: string
          email_usuario?: string | null
          estado_json?: Json
          external_user_id?: string | null
          id?: string
          nome_usuario?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_chat_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_chat_canal_widget_id_fkey"
            columns: ["canal_widget_id"]
            isOneToOne: false
            referencedRelation: "canais_widget"
            referencedColumns: ["id"]
          },
        ]
      }
      excecoes_atendimento: {
        Row: {
          atendente_id: string | null
          ativo: boolean
          data_fim: string
          data_inicio: string
          id: string
          motivo: string | null
          servico_id: string | null
          setor_id: string
          tipo: string
        }
        Insert: {
          atendente_id?: string | null
          ativo?: boolean
          data_fim: string
          data_inicio: string
          id?: string
          motivo?: string | null
          servico_id?: string | null
          setor_id: string
          tipo?: string
        }
        Update: {
          atendente_id?: string | null
          ativo?: boolean
          data_fim?: string
          data_inicio?: string
          id?: string
          motivo?: string | null
          servico_id?: string | null
          setor_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "excecoes_atendimento_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "atendentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excecoes_atendimento_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excecoes_atendimento_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      gestores_setor: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          papel: string
          setor_id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          papel?: string
          setor_id: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          papel?: string
          setor_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gestores_setor_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      janelas_atendimento: {
        Row: {
          atendente_id: string | null
          ativo: boolean
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          servico_id: string | null
          setor_id: string
          timezone: string
          tipo_janela: string
        }
        Insert: {
          atendente_id?: string | null
          ativo?: boolean
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          servico_id?: string | null
          setor_id: string
          timezone?: string
          tipo_janela?: string
        }
        Update: {
          atendente_id?: string | null
          ativo?: boolean
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          servico_id?: string | null
          setor_id?: string
          timezone?: string
          tipo_janela?: string
        }
        Relationships: [
          {
            foreignKeyName: "janelas_atendimento_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "atendentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "janelas_atendimento_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "janelas_atendimento_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_auditoria: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json
          entidade: string | null
          entidade_id: string | null
          id: string
          setor_id: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          setor_id?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          setor_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_auditoria_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_chat: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string
          id: string
          metadados: Json
          papel: string
        }
        Insert: {
          conteudo: string
          conversa_id: string
          created_at?: string
          id?: string
          metadados?: Json
          papel: string
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          created_at?: string
          id?: string
          metadados?: Json
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_chat_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_chat"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacoes: {
        Row: {
          ativo: boolean
          created_at: string
          dominio_email: string
          id: string
          nome: string
          slug: string
          timezone: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dominio_email: string
          id?: string
          nome: string
          slug: string
          timezone?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dominio_email?: string
          id?: string
          nome?: string
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
      origens_importacao_config: {
        Row: {
          aba: string | null
          created_at: string
          google_sheet_id: string | null
          id: string
          mensagem_erro: string | null
          nome: string
          setor_id: string
          status: string
          tipo_origem: string
          ultima_sincronizacao: string | null
        }
        Insert: {
          aba?: string | null
          created_at?: string
          google_sheet_id?: string | null
          id?: string
          mensagem_erro?: string | null
          nome: string
          setor_id: string
          status?: string
          tipo_origem: string
          ultima_sincronizacao?: string | null
        }
        Update: {
          aba?: string | null
          created_at?: string
          google_sheet_id?: string | null
          id?: string
          mensagem_erro?: string | null
          nome?: string
          setor_id?: string
          status?: string
          tipo_origem?: string
          ultima_sincronizacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "origens_importacao_config_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_usuario: {
        Row: {
          ativo: boolean
          created_at: string
          dominio: string | null
          email: string
          nome: string | null
          papel_global: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dominio?: string | null
          email: string
          nome?: string | null
          papel_global?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dominio?: string | null
          email?: string
          nome?: string | null
          papel_global?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      perguntas_respostas: {
        Row: {
          ativo: boolean
          bot_id: string
          categoria: string | null
          created_at: string
          id: string
          ordem: number
          palavras_chave: string | null
          pergunta: string
          resposta: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bot_id: string
          categoria?: string | null
          created_at?: string
          id?: string
          ordem?: number
          palavras_chave?: string | null
          pergunta: string
          resposta: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bot_id?: string
          categoria?: string | null
          created_at?: string
          id?: string
          ordem?: number
          palavras_chave?: string | null
          pergunta?: string
          resposta?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perguntas_respostas_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots_agendamento"
            referencedColumns: ["id"]
          },
        ]
      }
      servicos_agendamento: {
        Row: {
          antecedencia_maxima_dias: number
          antecedencia_minima_horas: number
          ativo: boolean
          bot_id: string | null
          calendario_id: string | null
          categoria: string | null
          created_at: string
          descricao_curta: string | null
          descricao_para_usuario: string | null
          duracao_minutos: number
          id: string
          instrucoes_confirmacao: string | null
          intervalo_slots_minutos: number
          local_atendimento: string | null
          nome: string
          ordem: number
          servico_pai_id: string | null
          setor_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          antecedencia_maxima_dias?: number
          antecedencia_minima_horas?: number
          ativo?: boolean
          bot_id?: string | null
          calendario_id?: string | null
          categoria?: string | null
          created_at?: string
          descricao_curta?: string | null
          descricao_para_usuario?: string | null
          duracao_minutos?: number
          id?: string
          instrucoes_confirmacao?: string | null
          intervalo_slots_minutos?: number
          local_atendimento?: string | null
          nome: string
          ordem?: number
          servico_pai_id?: string | null
          setor_id: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          antecedencia_maxima_dias?: number
          antecedencia_minima_horas?: number
          ativo?: boolean
          bot_id?: string | null
          calendario_id?: string | null
          categoria?: string | null
          created_at?: string
          descricao_curta?: string | null
          descricao_para_usuario?: string | null
          duracao_minutos?: number
          id?: string
          instrucoes_confirmacao?: string | null
          intervalo_slots_minutos?: number
          local_atendimento?: string | null
          nome?: string
          ordem?: number
          servico_pai_id?: string | null
          setor_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicos_agendamento_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicos_agendamento_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "calendarios_setor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicos_agendamento_servico_pai_id_fkey"
            columns: ["servico_pai_id"]
            isOneToOne: false
            referencedRelation: "servicos_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicos_agendamento_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          email_contato: string | null
          id: string
          nome: string
          organizacao_id: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          email_contato?: string | null
          id?: string
          nome: string
          organizacao_id: string
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          email_contato?: string | null
          id?: string
          nome?: string
          organizacao_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "setores_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin_plataforma: { Args: never; Returns: boolean }
      pode_editar_setor: { Args: { p_setor_id: string }; Returns: boolean }
      tem_acesso_setor: { Args: { p_setor_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
