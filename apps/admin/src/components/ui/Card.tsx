import * as React from "react"

import { cn } from "@/lib/utils"

// --- 1. المكونات الأساسية (Base Components) ---

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-border dark:border-white/5 bg-card text-card-foreground shadow-sm dark:shadow-inner-glow transition-all duration-200",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

// هذا المكون هو الذي كان مفقوداً وتسبب في الخطأ
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-5", className)} {...props} />
  )
)
CardFooter.displayName = "CardFooter"

// --- 2. مكونات الإحصائيات (Stats Card Components) ---

const StatsCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn(
        "relative overflow-hidden group flex flex-col justify-start",
        "bg-card hover:bg-muted/40",
        "border-border",
        "transition-colors duration-200",
        className
      )}
      {...props}
    />
  )
)
StatsCard.displayName = "StatsCard"

const StatsCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "p-5 w-full",
        className
      )}
      {...props}
    />
  )
)
StatsCardContent.displayName = "StatsCardContent"

const StatsCardIcon = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
        "transition-colors duration-200",
        "shadow-sm ring-1 ring-border/5",
        className
      )}
      {...props}
    />
  )
)
StatsCardIcon.displayName = "StatsCardIcon"

// --- 3. التصدير النهائي (تمت إضافة CardDescription و CardFooter) ---

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription, // تم الإصلاح هنا
  CardContent,
  CardFooter,      // لضمان عدم حدوث خطأ مستقبلاً
  StatsCard,
  StatsCardContent,
  StatsCardIcon
}