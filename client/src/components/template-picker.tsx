import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookOpen, Briefcase, Calendar, FileText, Beaker, GraduationCap, Presentation } from "lucide-react";

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  params: {
    [key: string]: {
      type: 'string' | 'number' | 'array';
      required: boolean;
      description: string;
    };
  };
}

interface TemplatesResponse {
  templates: TemplateDefinition[];
}

const templateIcons: Record<string, any> = {
  exam: GraduationCap,
  presentation: Presentation,
  homework: FileText,
  project: Briefcase,
  reading: BookOpen,
  lab: Beaker,
};

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplatePicker({ open, onOpenChange }: TemplatePickerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDefinition | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const { data: templatesData, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ["/api/templates"],
    enabled: open,
  });

  const applyTemplateMutation = useMutation({
    mutationFn: (data: { template: string; params: any }) =>
      apiRequest("/api/templates/apply", "POST", data),
    onSuccess: (response: any) => {
      toast({
        title: "Template applied",
        description: response.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/next"] });
      onOpenChange(false);
      setShowForm(false);
      setSelectedTemplate(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to apply template",
      });
    },
  });

  const handleTemplateClick = (template: TemplateDefinition) => {
    setSelectedTemplate(template);
    setShowForm(true);
  };

  const handleBackToTemplates = () => {
    setShowForm(false);
    setSelectedTemplate(null);
  };

  return (
    <>
      <Dialog open={open && !showForm} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl" data-testid="template-picker-dialog">
          <DialogHeader>
            <DialogTitle>Quick Add Templates</DialogTitle>
            <DialogDescription>
              Choose a template to quickly create structured plans for common tasks
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading templates...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
              {templatesData?.templates.map((template) => {
                const Icon = templateIcons[template.id] || Calendar;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className="group relative p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all text-left"
                    data-testid={`template-card-${template.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1">
                          {template.name}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {template.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedTemplate && (
        <TemplateFormDialog
          template={selectedTemplate}
          open={showForm}
          onOpenChange={setShowForm}
          onBack={handleBackToTemplates}
          onSubmit={applyTemplateMutation.mutate}
          isPending={applyTemplateMutation.isPending}
        />
      )}
    </>
  );
}

interface TemplateFormDialogProps {
  template: TemplateDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onSubmit: (data: { template: string; params: any }) => void;
  isPending: boolean;
}

function TemplateFormDialog({
  template,
  open,
  onOpenChange,
  onBack,
  onSubmit,
  isPending,
}: TemplateFormDialogProps) {
  const buildSchema = () => {
    const schemaFields: Record<string, any> = {};

    Object.entries(template.params).forEach(([key, config]) => {
      if (config.type === 'string') {
        schemaFields[key] = config.required
          ? z.string().min(1, `${key} is required`)
          : z.string().optional();
      } else if (config.type === 'number') {
        schemaFields[key] = config.required
          ? z.number().min(0, `${key} must be positive`)
          : z.number().optional();
      } else if (config.type === 'array') {
        schemaFields[key] = config.required
          ? z.string().min(1, `${key} is required`).transform(val => val.split(',').map(s => s.trim()))
          : z.string().optional().transform(val => val ? val.split(',').map(s => s.trim()) : []);
      }
    });

    return z.object(schemaFields);
  };

  const formSchema = buildSchema();
  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: Object.keys(template.params).reduce((acc, key) => {
      const param = template.params[key];
      if (param.type === 'string') acc[key] = '';
      if (param.type === 'number') acc[key] = param.required ? 0 : undefined;
      if (param.type === 'array') acc[key] = '';
      return acc;
    }, {} as any),
  });

  const handleSubmit = (data: FormData) => {
    const params: Record<string, any> = {};
    
    Object.entries(data).forEach(([key, value]) => {
      const paramConfig = template.params[key];
      if (paramConfig.type === 'number' && typeof value === 'string') {
        params[key] = parseFloat(value);
      } else {
        params[key] = value;
      }
    });

    onSubmit({
      template: template.id,
      params,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid={`template-form-${template.id}`}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="mr-2"
              data-testid="back-to-templates"
            >
              ← Back
            </Button>
          </div>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {Object.entries(template.params).map(([key, config]) => (
              <FormField
                key={key}
                control={form.control}
                name={key as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                      {config.required && <span className="text-destructive ml-1">*</span>}
                    </FormLabel>
                    <FormControl>
                      {config.type === 'number' ? (
                        <Input
                          type="number"
                          placeholder={config.description}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : '')}
                          data-testid={`input-${key}`}
                        />
                      ) : config.type === 'array' ? (
                        <Input
                          placeholder={config.description + ' (comma-separated)'}
                          {...field}
                          data-testid={`input-${key}`}
                        />
                      ) : key.toLowerCase().includes('date') || key.toLowerCase().includes('deadline') ? (
                        <Input
                          type="date"
                          placeholder={config.description}
                          {...field}
                          data-testid={`input-${key}`}
                        />
                      ) : (
                        <Input
                          placeholder={config.description}
                          {...field}
                          data-testid={`input-${key}`}
                        />
                      )}
                    </FormControl>
                    <FormDescription>{config.description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                className="flex-1"
                data-testid="cancel-template"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
                data-testid="submit-template"
              >
                {isPending ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
